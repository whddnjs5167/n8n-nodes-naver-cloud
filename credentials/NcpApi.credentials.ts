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

	// ✔ Credential 테스트 (필수) Credential 등록할 때 N8N에서 테스트로 호출하는 용도
	test: ICredentialTestRequest = {
		request: {
			method: 'GET',
			baseURL: 'https://www.naver.com',
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
			placeholder: 'e.g. ncp_iam_A1B2... (NCP API Access Key)',
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
			placeholder: 'e.g. ncp_iam_A1B2.... (NCP API Secret Key)',
		},
	];
}