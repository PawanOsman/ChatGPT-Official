import { DbContext, DbSet } from "dbcontext";
import OpenAIKey from "../models/openai-key.js";

class AppDbContext extends DbContext {
	constructor() {
		super();
	}

	keys = new DbSet<OpenAIKey>("keys");
}

export default AppDbContext;
