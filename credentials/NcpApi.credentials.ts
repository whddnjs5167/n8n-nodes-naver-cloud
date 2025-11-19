import type {
	ICredentialType,
	INodeProperties,
	ICredentialTestRequest,
    Icon,
} from 'n8n-workflow';

export class NcpApi implements ICredentialType {
	name = 'ncpApi';
	displayName = 'Naver Cloud Platform API';
	documentationUrl = 'https://api.ncloud-docs.com/docs/en/common-signature';

	icon: Icon = { light: 'file:../icons/github.svg', dark: 'file:../icons/github.dark.svg' };

	// ✔ Credential 테스트 (필수)
	test: ICredentialTestRequest = {
		request: {
			method: 'GET',
			baseURL: 'https://ncloud.apigw.ntruss.com',
			url: '/',
		},
	};

	properties: INodeProperties[] = [
		{
			displayName: 'Access Key',
			name: 'accessKey',
			type: 'string',
			default: '',
			required: true,
			placeholder: 'e.g. 4zS2Jt... (NCP API Access Key)',
		},
		{
			displayName: 'Secret Key',
			name: 'secretKey',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			required: true,
			placeholder: 'e.g. KtshDM... (NCP API Secret Key)',
		},
	];
}