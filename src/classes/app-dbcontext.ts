import { DbContext, DbSet } from "dbcontext";
import Conversation from "../models/conversation.js";
import OpenAIKey from "../models/openai-key.js";

class AppDbContext extends DbContext {
	constructor(path?: string) {
		super(path);
	}

	keys = new DbSet<OpenAIKey>("keys");
	conversations = new DbSet<Conversation>("conversations");
}

export default AppDbContext;
