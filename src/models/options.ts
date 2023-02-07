interface Options {
	model?: string;
	temperature?: number;
	max_tokens?: number;
	top_p?: number;
	frequency_penalty?: number;
	presence_penalty?: number;
	instructions?: string;
	stop?: string;
	aiName?: string;
	moderation?: boolean;
	revProxy?: string;
}

export default Options;
