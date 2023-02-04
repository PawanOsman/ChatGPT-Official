import ChatGPT from "../dist/index.js";

let bot = new ChatGPT(process.env.OPENAI_API_KEY);

async function main() {
  let response = await bot.askStream(res => {
    console.log(res.toString());
  }, "write 10 lines every line must be 15 words");

  console.log(response);
}

main();