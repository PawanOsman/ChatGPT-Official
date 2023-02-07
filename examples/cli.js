import ChatGPT from "../dist/index.js";
import readline from "readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

let bot = new ChatGPT(process.env.OPENAI_API_KEY);

async function main() {
  while (true) {
    let prompt = await new Promise((resolve) => {
      rl.question("You: ", (answer) => {
        resolve(answer);
      });
    });

    process.stdout.write("ChatGPT: ");
    await bot.askStream(res => {
      process.stdout.write(res.toString());
    }, prompt);
    console.log();
  }
}

main();