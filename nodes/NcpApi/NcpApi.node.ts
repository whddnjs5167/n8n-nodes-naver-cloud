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
	pathWithQuery: string,
	timestamp: string,
	accessKey: string,
	secretKey: string,
): string {
	const space = ' ';
	const newLine = '\n';

	const message: BinaryLike = `${method}${space}${pathWithQuery}${newLine}${timestamp}${newLine}${accessKey}`;

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
				default: '/vserver/v2/getRegionList?responseFormatType=json',
				required: true,
				description: '요청 경로: 쿼리스트링이 포함된 전체 Path를 넣을 수 있습니다 (예: /vserver/v2/getRegionList?responseFormatType=JSON)',
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
				description:
					'Whether to include a JSON body in the request (주로 POST/PUT/PATCH 요청에 사용)',
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
				// --- Base URL 처리 (민간/공공/금융/Custom) ---
				const baseUrlParam = this.getNodeParameter('baseUrl', i) as string;
				const baseUrl =
					baseUrlParam === 'custom'
						? (this.getNodeParameter('customBaseUrl', i) as string)
						: baseUrlParam;

				if (!baseUrl) {
					throw new NodeApiError(this.getNode(), {
						message: 'Base URL is required',
					});
				}

				// --- Path + 쿼리스트링 처리 ---
				const rawPathParam = this.getNodeParameter('path', i) as string;

				if (!rawPathParam || !rawPathParam.startsWith('/')) {
					throw new NodeApiError(this.getNode(), {
						message: 'Path must start with "/"',
					});
				}

				let basePath = rawPathParam;
				let searchParams = new URLSearchParams();

				if (rawPathParam.includes('?')) {
					const [pathOnly, queryString] = rawPathParam.split('?', 2);
					basePath = pathOnly || '/';

					if (queryString) {
						searchParams = new URLSearchParams(queryString);
					}
				}

				// fixedCollection Query → URLSearchParams에 merge (직접 입력이 우선)
				const queryCollection = this.getNodeParameter('query', i, {}) as {
					params?: IDataObject[];
				};

				if (queryCollection.params && Array.isArray(queryCollection.params)) {
					for (const param of queryCollection.params) {
						const name = param.name as string;
						const value = param.value as string;
						if (name) {
							searchParams.set(name, value);
						}
					}
				}

				const queryStringFinal = searchParams.toString();
				const pathWithQuery =
					queryStringFinal.length > 0
						? `${basePath}?${queryStringFinal}`
						: basePath;

				const method = this.getNodeParameter('method', i) as IHttpRequestMethods;

				const sendBody = this.getNodeParameter('sendBody', i, false) as boolean;
				const bodyJson = this.getNodeParameter('bodyJson', i, '{}') as string;

				// NCP API credentials
				const credentials = (await this.getCredentials('ncpApi')) as {
					accessKey: string;
					secretKey: string;
				};

				const timestamp = Date.now().toString();
				const signature = createNcpSignature(
					method,
					pathWithQuery,
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
					url: `${baseUrl}${pathWithQuery}`,
					headers,
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
