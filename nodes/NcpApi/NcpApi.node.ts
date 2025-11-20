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
		usableAsTool: true,
		inputs: ['main'],
		outputs: ['main'],

		credentials: [
			{
				name: 'ncpApi',
				required: true,
			},
		],

		properties: [
			// ---- Base URL 선택 (민간/공공/금융/Custom) ----
			{
				displayName: 'API Gateway',
				name: 'baseUrl',
				type: 'options',
				default: 'https://ncloud.apigw.ntruss.com',
				options: [
					{
						name: 'NCP (민간)',
						value: 'https://ncloud.apigw.ntruss.com',
						description: '민간존 API Gateway',
					},
					{
						name: 'NCP (공공)',
						value: 'https://ncloud.apigw.gov-ntruss.com',
						description: '공공존(gov) API Gateway',
					},
					{
						name: 'NCP (금융)',
						value: 'https://fin-ncloud.apigw.fin-ntruss.com',
						description: '금융존(Financial) API Gateway',
					},
					{
						name: 'Custom (직접 입력)',
						value: 'custom',
						description: '직접 API Gateway URL 입력',
					},
				],
				description: 'NCP API Gateway endpoint를 선택합니다',
			},
			{
				displayName: 'Custom Base URL',
				name: 'customBaseUrl',
				type: 'string',
				default: '',
				placeholder: 'https://example.apigw.ntruss.com',
				displayOptions: {
					show: {
						baseUrl: ['custom'],
					},
				},
				description: 'Custom을 선택했을 때 사용할 API Gateway URL',
			},

			{
				displayName: 'Path',
				name: 'path',
				type: 'string',
				default: '',
				required: true,
				description: '쿼리스트링이 포함된 전체 Path를 넣어도 됩니다 (예: /vserver/v2/getRegionList?responseFormatType=JSON)',
			},
			{
				displayName: 'HTTP Method',
				name: 'method',
				type: 'options',
				options: [
					{ name: 'DELETE', value: 'DELETE' },
					{ name: 'GET', value: 'GET' },
					{ name: 'PATCH', value: 'PATCH' },
					{ name: 'POST', value: 'POST' },
					{ name: 'PUT', value: 'PUT' },
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
				// 기본으로 responseFormatType=json 하나 넣어둬도 편함
				default: {
					params: [
						{
							name: 'responseFormatType',
							value: 'json',
						},
					],
				},
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
				description: 'Whether to include a JSON body in the request (주로 POST/PUT/PATCH 요청에 사용)',
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
				description: '요청에 포함할 Raw JSON body',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnItems: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				// --- Base URL 처리 (민간/공공/금융/Custom) ---
				const baseUrlParam = this.getNodeParameter('baseUrl', i) as string;
				const baseUrl =
					baseUrlParam === 'custom'
						? (this.getNodeParameter('customBaseUrl', i) as string)
						: baseUrlParam;

				// --- Path + 쿼리스트링 분리 ---
				const rawPath = this.getNodeParameter('path', i) as string;
				let purePath = rawPath;
				const qs: IDataObject = {};

				if (rawPath.includes('?')) {
					const [pathOnly, queryString] = rawPath.split('?', 2);
					purePath = pathOnly || '/';

					if (queryString) {
						const sp = new URLSearchParams(queryString);
						for (const [key, value] of sp.entries()) {
							qs[key] = value;
						}
					}
				}

				const method = this.getNodeParameter('method', i) as IHttpRequestMethods;

				const sendBody = this.getNodeParameter('sendBody', i, false) as boolean;
				const bodyJson = this.getNodeParameter('bodyJson', i, '{}') as string;

				// fixedCollection Query → qs에 merge (직접 입력이 우선)
				const queryCollection = this.getNodeParameter('query', i, {}) as IDataObject;

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
					purePath,
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
					url: `${baseUrl}${purePath}`,
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
