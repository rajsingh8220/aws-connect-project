import json
import urllib.request

import boto3

connect = boto3.client('connect')


def send_response(event, context, status, data=None, physical_resource_id=None):
    body = json.dumps(
        {
            'Status': status,
            'Reason': f'See CloudWatch Log Stream: {context.log_stream_name}',
            'PhysicalResourceId': physical_resource_id or event.get('PhysicalResourceId') or event['LogicalResourceId'],
            'StackId': event['StackId'],
            'RequestId': event['RequestId'],
            'LogicalResourceId': event['LogicalResourceId'],
            'Data': data or {},
        }
    ).encode('utf-8')
    request = urllib.request.Request(
        event['ResponseURL'],
        data=body,
        method='PUT',
        headers={'content-type': '', 'content-length': str(len(body))},
    )
    with urllib.request.urlopen(request) as response:
        response.read()


def handler(event, context):
    print(json.dumps(event))
    props = event.get('ResourceProperties', {})
    instance_id = props['InstanceId']
    country_code = props.get('CountryCode', 'US')
    phone_type = props.get('PhoneNumberType', 'DID')
    prefix = props.get('Prefix') or None
    description = props.get('Description', 'Inbound DID')

    try:
        if event['RequestType'] == 'Delete':
            phone_number_id = event.get('PhysicalResourceId')
            if phone_number_id and phone_number_id != event['LogicalResourceId']:
                try:
                    connect.release_phone_number(PhoneNumberId=phone_number_id)
                except Exception as error:
                    print(f'Release skipped: {error}')
            send_response(event, context, 'SUCCESS', physical_resource_id=phone_number_id or 'deleted-phone')
            return

        last_error = None
        search_attempts = []
        if prefix:
            search_attempts.append({'PhoneNumberPrefix': prefix})
        search_attempts.append({})

        candidates = []
        for attempt in search_attempts:
            search_kwargs = {
                'InstanceId': instance_id,
                'PhoneNumberCountryCode': country_code,
                'PhoneNumberType': phone_type,
                'MaxResults': 10,
                **attempt,
            }
            candidates = connect.search_available_phone_numbers(**search_kwargs).get('AvailableNumbersList', [])
            if candidates:
                break

        if not candidates:
            raise RuntimeError('No available phone numbers found')

        for entry in candidates:
            phone = entry['PhoneNumber']
            try:
                claim = connect.claim_phone_number(
                    PhoneNumber=phone,
                    InstanceId=instance_id,
                    PhoneNumberDescription=description,
                )
                physical_id = claim['PhoneNumberId']
                send_response(
                    event,
                    context,
                    'SUCCESS',
                    {
                        'PhoneNumber': phone,
                        'PhoneNumberId': claim['PhoneNumberId'],
                        'PhoneNumberArn': claim['PhoneNumberArn'],
                    },
                    physical_id,
                )
                return
            except Exception as error:
                print(f'Claim failed for {phone}: {error}')
                last_error = error

        raise RuntimeError(f'Unable to claim phone number: {last_error}')
    except Exception as error:
        print(error)
        send_response(event, context, 'FAILED', physical_resource_id='failed-phone-claim')
