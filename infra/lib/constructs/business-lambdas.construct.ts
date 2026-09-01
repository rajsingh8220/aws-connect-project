import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';
import { projectPath } from '../utils/project-paths';
import { PROJECT_CONFIG } from '../config/project-config';

export interface BusinessLambdasConstructProps {
  readonly connectInstanceArn: string;
  readonly apiBaseUrl: string;
}

export class BusinessLambdasConstruct extends Construct {
  readonly vanityTable: dynamodb.Table;
  readonly accountLookupFunction: lambda.Function;
  readonly vanityNumberFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: BusinessLambdasConstructProps) {
    super(scope, id);

    this.vanityTable = new dynamodb.Table(this, 'VanityNumbersTable', {
      tableName: PROJECT_CONFIG.dynamodb.vanityTableName,
      partitionKey: { name: 'callerPhoneNumber', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'rank', type: dynamodb.AttributeType.NUMBER },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.accountLookupFunction = new NodejsFunction(this, 'AccountLookup', {
      functionName: PROJECT_CONFIG.lambda.accountLookupName,
      entry: projectPath('lambda/account-lookup/src/handler.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(15),
      environment: {
        API_BASE_URL: props.apiBaseUrl,
      },
      bundling: {
        minify: true,
        sourceMap: true,
      },
    });

    this.vanityNumberFunction = new NodejsFunction(this, 'VanityNumber', {
      functionName: PROJECT_CONFIG.lambda.vanityNumberName,
      entry: projectPath('lambda/vanity-number/src/handler.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(15),
      environment: {
        VANITY_TABLE_NAME: this.vanityTable.tableName,
      },
      bundling: {
        minify: true,
        sourceMap: true,
      },
    });

    this.vanityTable.grantReadWriteData(this.vanityNumberFunction);

    this.accountLookupFunction.addPermission('ConnectInvoke', {
      principal: new iam.ServicePrincipal('connect.amazonaws.com'),
      sourceArn: props.connectInstanceArn,
      action: 'lambda:InvokeFunction',
    });

    this.vanityNumberFunction.addPermission('ConnectInvoke', {
      principal: new iam.ServicePrincipal('connect.amazonaws.com'),
      sourceArn: props.connectInstanceArn,
      action: 'lambda:InvokeFunction',
    });
  }
}
