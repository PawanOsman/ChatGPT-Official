import MessageType from "../enums/message-type.js";

interface Message {
	type: MessageType;
	content: string;
	date: number;
}

export default Message;
