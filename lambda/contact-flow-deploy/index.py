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
    instance_id = props['InstanceId']
    name = props['Name']
    description = props.get('Description', '')
    content = props['Content']

    try:
        if event['RequestType'] == 'Delete':
            flow_id = event.get('PhysicalResourceId')
            if flow_id and flow_id != event['LogicalResourceId']:
                try:
                    connect.delete_contact_flow(InstanceId=instance_id, ContactFlowId=flow_id)
                except Exception as error:
                    print(f'Delete skipped: {error}')
            send_response(event, context, 'SUCCESS', physical_resource_id=flow_id or 'deleted-flow')
            return

        if event['RequestType'] in ('Create', 'Update'):
            flow_id = event.get('PhysicalResourceId')
            if event['RequestType'] == 'Update' and flow_id and flow_id != event['LogicalResourceId']:
                try:
                    connect.update_contact_flow_content(
                        InstanceId=instance_id,
                        ContactFlowId=flow_id,
                        Content=content,
                    )
                    send_response(
                        event,
                        context,
                        'SUCCESS',
                        {
                            'ContactFlowArn': f'arn:aws:connect:{context.invoked_function_arn.split(":")[3]}:{context.invoked_function_arn.split(":")[4]}:instance/{instance_id}/contact-flow/{flow_id}',
                            'ContactFlowId': flow_id,
                        },
                        flow_id,
                    )
                    return
                except Exception as error:
                    print(f'Update failed, creating new flow: {error}')

        response = connect.create_contact_flow(
            InstanceId=instance_id,
            Name=name,
            Type='CONTACT_FLOW',
            Description=description,
            Content=content,
            Status='PUBLISHED',
        )
        flow_id = response['ContactFlowId']
        send_response(
            event,
            context,
            'SUCCESS',
            {
                'ContactFlowArn': response['ContactFlowArn'],
                'ContactFlowId': flow_id,
            },
            flow_id,
        )
    except Exception as error:
        print(error)
        send_response(event, context, 'FAILED', physical_resource_id='failed-contact-flow')
