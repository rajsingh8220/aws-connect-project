import json
import urllib.request

import boto3

connect = boto3.client('connect')


def send_response(event, context, status, data=None, physical_resource_id=None):
    body = json.dumps(
        {
            'Status': status,
            'Reason': f'See CloudWatch Log Stream: {context.log_stream_name}',
            'PhysicalResourceId': physical_resource_id
            or event.get('PhysicalResourceId')
            or event['LogicalResourceId'],
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
    physical_id = f"{props.get('PhoneNumberId', 'phone')}-{props.get('ContactFlowId', 'flow')}"

    try:
        if event['RequestType'] == 'Delete':
            try:
                if props.get('PhoneNumberId') and props.get('InstanceId'):
                    connect.disassociate_phone_number_contact_flow(
                        InstanceId=props['InstanceId'],
                        PhoneNumberId=props['PhoneNumberId'],
                    )
            except Exception as disassociate_error:
                print(f'Disassociate skipped: {disassociate_error}')
            send_response(event, context, 'SUCCESS', physical_resource_id=physical_id)
            return

        connect.associate_phone_number_contact_flow(
            InstanceId=props['InstanceId'],
            PhoneNumberId=props['PhoneNumberId'],
            ContactFlowId=props['ContactFlowId'],
        )
        send_response(event, context, 'SUCCESS', {'Associated': 'true'}, physical_id)
    except Exception as error:
        print(error)
        send_response(event, context, 'FAILED', physical_resource_id=physical_id)
