/**
 * A stand-in for a model: an answer that arrives a few words at a time.
 *
 * Any model SDK's stream can go where this goes — OpenAI's and Anthropic's
 * event streams, Ollama's, LangChain's, a Vercel AI SDK result, a web
 * `ReadableStream`, bytes, an event emitter. Each is recognised by its shape,
 * so none of those SDKs is a dependency of Yuigram, and this example calls none
 * of them.
 */

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** Written in MarkdownV2, as a model asked for Telegram's markup might write it. */
const REPLY = [
  'Here is *what streaming does*:',
  '\n\n1\\. The reader sees a _draft_ growing while the answer is written\\.',
  '\n2\\. Each time a message fills, it is sent and the next one begins\\.',
  '\n3\\. The end is sent as a message, with its formatting intact\\.',
]

/** The answer to a question, word by word, as chunks shaped like a chat-completions stream. */
export async function* answer(question: string, pause = 40): AsyncGenerator<unknown> {
  yield { choices: [{ delta: { content: `You asked: ${markdownV2(question)}\n\n` } }] }

  for (const sentence of REPLY) {
    for (const word of sentence.split(/(?<= )/)) {
      await sleep(pause)
      yield { choices: [{ delta: { content: word } }] }
    }
  }
}

/** The same answer in rich Markdown, for a rich message. */
export async function* richAnswer(pause = 40): AsyncGenerator<string> {
  const text =
    '# Streaming\n\nA rich message keeps **blocks** as they are written:\n\n' +
    '- a heading\n- a list\n\n| Step | Shown as |\n|:--|:--|\n| writing | a draft |\n| done | a message |\n'

  for (const piece of text.split(/(?<=\n)/)) {
    await sleep(pause)
    yield piece
  }
}

/** Text as MarkdownV2 shows it, whatever it contains. */
function markdownV2(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&')
}
