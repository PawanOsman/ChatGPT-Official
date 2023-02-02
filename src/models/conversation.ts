interface conversation {
	id: string;
	messages: string[];
	userName: string;
	aiName: string;
	lastActive?: number;
}

export default conversation;
