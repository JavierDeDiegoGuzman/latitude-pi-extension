export type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

export type OpenApiParameter = {
	name: string;
	in: "path" | "query" | "header" | "cookie" | string;
	required?: boolean;
	description?: string;
	schema?: OpenApiSchema;
};

export type OpenApiRequestBody = {
	$ref?: string;
	required?: boolean;
	description?: string;
	content?: Record<string, { schema?: OpenApiSchema }>;
};

export type OpenApiSchema = {
	type?: string;
	format?: string;
	description?: string;
	enum?: unknown[];
	items?: OpenApiSchema;
	properties?: Record<string, OpenApiSchema>;
	required?: string[];
	allOf?: OpenApiSchema[];
	anyOf?: OpenApiSchema[];
	oneOf?: OpenApiSchema[];
	$ref?: string;
	additionalProperties?: boolean | OpenApiSchema;
};

export type OpenApiOperation = {
	operationId?: string;
	summary?: string;
	description?: string;
	tags?: string[];
	parameters?: OpenApiParameter[];
	requestBody?: OpenApiRequestBody;
};

export type OpenApiSpec = {
	paths?: Record<string, Record<string, OpenApiOperation | unknown>>;
	components?: {
		schemas?: Record<string, OpenApiSchema>;
		requestBodies?: Record<string, OpenApiRequestBody>;
	};
};

export type OperationInfo = {
	operationId: string;
	method: HttpMethod;
	pathTemplate: string;
	summary?: string;
	description?: string;
	tags: string[];
	parameters: OpenApiParameter[];
	requestBody?: OpenApiRequestBody;
	schemas?: Record<string, OpenApiSchema>;
	requestBodies?: Record<string, OpenApiRequestBody>;
};

export type OperationIndex = Map<string, OperationInfo>;
