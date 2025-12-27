/**
 * Feedback Button Block for Orion responses
 *
 * Uses Slack's native feedback_buttons element for collecting user feedback.
 * The context_actions block type is specific to Slack AI apps.
 *
 * @see FR48 - User feedback via Slack's native feedback_buttons
 * @see Story 1.8 - Feedback Button Infrastructure
 * @see https://docs.slack.dev/reference/block-kit/block-elements/feedback-buttons-element/
 */

interface FeedbackButtonsElement {
  type: 'feedback_buttons';
  action_id: string;
  positive_button: {
    text: { type: 'plain_text'; text: string };
    accessibility_label: string;
    value: string;
  };
  negative_button: {
    text: { type: 'plain_text'; text: string };
    accessibility_label: string;
    value: string;
  };
}

interface FeedbackBlock {
  type: 'context_actions';
  elements: FeedbackButtonsElement[];
}

/**
 * Feedback block to append to Orion responses.
 * Uses context_actions type for Slack AI app compatibility.
 */
export const feedbackBlock: FeedbackBlock = {
  type: 'context_actions' as const,
  elements: [
    {
      type: 'feedback_buttons',
      action_id: 'orion_feedback',
      positive_button: {
        text: { type: 'plain_text' as const, text: 'Helpful' },
        accessibility_label: 'Mark this response as helpful',
        value: 'positive',
      },
      negative_button: {
        text: { type: 'plain_text' as const, text: 'Not helpful' },
        accessibility_label: 'Mark this response as not helpful',
        value: 'negative',
      },
    },
  ],
};

