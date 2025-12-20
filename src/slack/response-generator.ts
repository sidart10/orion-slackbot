/**
 * Response Generator for Streaming
 *
 * Provides async generator patterns for streaming responses.
 * This placeholder will be replaced by Claude Agent SDK in Story 2.1.
 *
 * @see Story 1.5 - Response Streaming
 * @see AC#1 - Response streams to Slack
 */

/** Delay between placeholder chunks in milliseconds (L2 fix) */
const PLACEHOLDER_CHUNK_DELAY_MS = 20;

/**
 * Placeholder response generator
 * Simulates streaming by yielding chunks with delays
 *
 * Will be replaced by Claude Agent SDK in Story 2.1
 *
 * @param contextCount - Number of context messages available
 * @yields String chunks simulating a streaming response
 */
export async function* generatePlaceholderResponse(
  contextCount: number
): AsyncGenerator<string, void, unknown> {
  const words = [
    'I ',
    'received ',
    'your ',
    'message ',
    'and ',
    'have ',
    `*${contextCount}* `,
    'messages ',
    'of ',
    'context. ',
    '\n\n',
    'Full ',
    '_streaming_ ',
    'agent ',
    'capabilities ',
    'coming ',
    'in ',
    'Story ',
    '2.1!',
  ];

  for (const word of words) {
    // Small delay to simulate typing/streaming
    await new Promise((resolve) => setTimeout(resolve, PLACEHOLDER_CHUNK_DELAY_MS));
    yield word;
  }
}

/**
 * Generator for streaming chunks from an async iterable source
 * This pattern will be used with Claude Agent SDK streaming
 *
 * @param source - Async iterable source of chunks
 * @yields Chunks from the source
 */
export async function* streamFromSource<T>(
  source: AsyncIterable<T>
): AsyncGenerator<T, void, unknown> {
  for await (const chunk of source) {
    yield chunk;
  }
}

