import json
import time
import urllib.request

import boto3
from botocore.exceptions import ClientError

connect = boto3.client('connect')

MAX_ATTEMPTS = 8
RETRY_DELAY_SECONDS = 10


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
    function_arns = [arn for arn in props.get('FunctionArns', '').split(',') if arn]
    physical_id = f'connect-lambdas-{instance_id}'

    try:
        if event['RequestType'] == 'Delete':
            for arn in function_arns:
                try:
                    connect.disassociate_lambda_function(InstanceId=instance_id, FunctionArn=arn)
                except Exception as error:
                    print(f'Disassociate skipped for {arn}: {error}')
            send_response(event, context, 'SUCCESS', physical_resource_id=physical_id)
            return

        for arn in function_arns:
            for attempt in range(1, MAX_ATTEMPTS + 1):
                try:
                    connect.associate_lambda_function(InstanceId=instance_id, FunctionArn=arn)
                    break
                except ClientError as error:
                    code = error.response.get('Error', {}).get('Code', '')
                    if code in {'ResourceNotFoundException', 'InvalidRequestException'} and attempt < MAX_ATTEMPTS:
                        print(f'Associate retry {attempt} for {arn}: {error}')
                        time.sleep(RETRY_DELAY_SECONDS)
                        continue
                    raise

        send_response(
            event,
            context,
            'SUCCESS',
            {'RegisteredCount': str(len(function_arns))},
            physical_id,
        )
    except Exception as error:
        print(error)
        send_response(event, context, 'FAILED', physical_resource_id=physical_id)
