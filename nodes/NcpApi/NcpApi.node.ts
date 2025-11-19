import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

// Node.js built-in crypto (외부 dependency 아님 → n8n Cloud OK)
import type { BinaryLike } from 'crypto';
import { createHmac } from 'crypto';

function createNcpSignature(
	method: IHttpRequestMethods,
	path: string,
	timestamp: string,
	accessKey: string,
	secretKey: string,
): string {
	const space = ' ';
	const newLine = '\n';

	const message: BinaryLike = `${method}${space}${path}${newLine}${timestamp}${newLine}${accessKey}`;

	return createHmac('sha256', secretKey).update(message).digest('base64');
}

export class NcpApi implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Naver Cloud Platform API',
		name: 'ncpApi',
		icon: 'file:example.svg',
		group: ['transform'],
		version: 1,
		description: 'Call Naver Cloud Platform APIs with signed requests',
		defaults: {
			name: 'NCP API',
		},
		// 🔥 tool로 사용 가능
		usableAsTool: true,

		// ❗ 여기서 더 이상 NodeConnectionType 안 씀
		inputs: ['main'],
		outputs: ['main'],

		credentials: [
			{
				// credentials 파일에서 정의할 이름과 동일해야 함
				name: 'ncpApi',
				required: true,
			},
		],

		properties: [
			// ---- 공통 설정 ----
			{
				displayName: 'Base URL',
				name: 'baseUrl',
				type: 'string',
				default: 'https://ncloud.apigw.ntruss.com',
				required: true,
				description:
					'NCP API Gateway base URL (예: https://ncloud.apigw.ntruss.com)',
			},
			{
				displayName: 'Path',
				name: 'path',
				type: 'string',
				default: '/server/v2/getServerInstanceList',
				required: true,
				description:
					'Request path starting with / (쿼리스트링 제외, 예: /server/v2/getServerInstanceList)',
			},
			{
				displayName: 'HTTP Method',
				name: 'method',
				type: 'options',
				options: [
					// 이름(name) 기준 알파벳 순서: DELETE | GET | PATCH | POST | PUT
					{
						name: 'DELETE',
						value: 'DELETE',
					},
					{
						name: 'GET',
						value: 'GET',
					},
					{
						name: 'PATCH',
						value: 'PATCH',
					},
					{
						name: 'POST',
						value: 'POST',
					},
					{
						name: 'PUT',
						value: 'PUT',
					},
				],
				default: 'GET',
				required: true,
				description: 'HTTP method to use',
			},

			// ---- 쿼리 파라미터 ----
			{
				displayName: 'Query Parameters',
				name: 'query',
				type: 'fixedCollection',
				placeholder: 'Add Query Param',
				typeOptions: {
					multipleValues: true,
				},
				default: {},
				options: [
					{
						name: 'params',
						displayName: 'Params',
						values: [
							{
								displayName: 'Name',
								name: 'name',
								type: 'string',
								default: '',
							},
							{
								displayName: 'Value',
								name: 'value',
								type: 'string',
								default: '',
							},
						],
					},
				],
			},

			// ---- Body ----
			{
				displayName: 'Send Body',
				name: 'sendBody',
				type: 'boolean',
				default: false,
				description: 'Whether to send a JSON body (POST/PUT/PATCH일 때 주로 사용)',
			},
			{
				displayName: 'Body (JSON)',
				name: 'bodyJson',
				type: 'json',
				default: '{}',
				displayOptions: {
					show: {
						sendBody: [true],
					},
				},
				description: 'Raw JSON body to send with the request',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnItems: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const baseUrl = this.getNodeParameter('baseUrl', i) as string;
				const path = this.getNodeParameter('path', i) as string;
				const method = this.getNodeParameter('method', i) as IHttpRequestMethods;

				const sendBody = this.getNodeParameter('sendBody', i, false) as boolean;
				const bodyJson = this.getNodeParameter('bodyJson', i, '{}') as string;

				// 쿼리 파라미터 fixedCollection → object 로 변환
				const queryCollection = this.getNodeParameter('query', i, {}) as IDataObject;
				const qs: IDataObject = {};

				if (queryCollection && Array.isArray(queryCollection.params)) {
					for (const param of queryCollection.params as IDataObject[]) {
						const name = param.name as string;
						const value = param.value as string;
						if (name) {
							qs[name] = value;
						}
					}
				}

				// NCP API credentials
				const credentials = (await this.getCredentials('ncpApi')) as {
					accessKey: string;
					secretKey: string;
				};

				const timestamp = Date.now().toString();
				const signature = createNcpSignature(
					method,
					path,
					timestamp,
					credentials.accessKey,
					credentials.secretKey,
				);

				const headers: IDataObject = {
					'x-ncp-apigw-timestamp': timestamp,
					'x-ncp-iam-access-key': credentials.accessKey,
					'x-ncp-apigw-signature-v2': signature,
					'Content-Type': 'application/json',
				};

				const requestOptions: IHttpRequestOptions = {
					method,
					url: `${baseUrl}${path}`,
					headers,
					qs,
					json: true,
				};

				if (sendBody) {
					let bodyData: IDataObject = {};
					if (typeof bodyJson === 'string' && bodyJson.trim() !== '') {
						bodyData = JSON.parse(bodyJson) as IDataObject;
					}
					requestOptions.body = bodyData;
				}

				const responseData = await this.helpers.httpRequest(requestOptions);

				returnItems.push({
					json: responseData as IDataObject,
				});
			} catch (error) {
				throw new NodeApiError(this.getNode(), error);
			}
		}

		return [returnItems];
	}
}
