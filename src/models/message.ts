import MessageType from "../enums/message-type.js";

interface Message {
	id: string;
	type: MessageType;
	content: string;
	date: number;
}

export default Message;
