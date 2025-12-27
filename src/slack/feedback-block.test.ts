import { describe, it, expect } from 'vitest';
import { feedbackBlock } from './feedback-block.js';

describe('feedbackBlock', () => {
  it('should export feedbackBlock constant', () => {
    expect(feedbackBlock).toBeDefined();
  });

  it('should have type context_actions', () => {
    expect(feedbackBlock.type).toBe('context_actions');
  });

  it('should have elements array with one feedback_buttons element', () => {
    expect(feedbackBlock.elements).toBeDefined();
    expect(Array.isArray(feedbackBlock.elements)).toBe(true);
    expect(feedbackBlock.elements.length).toBe(1);
    expect(feedbackBlock.elements[0].type).toBe('feedback_buttons');
  });

  it('should have action_id of orion_feedback', () => {
    expect(feedbackBlock.elements[0].action_id).toBe('orion_feedback');
  });

  it('should have positive button with value positive', () => {
    const element = feedbackBlock.elements[0];
    expect(element.positive_button).toBeDefined();
    expect(element.positive_button.value).toBe('positive');
    expect(element.positive_button.text.type).toBe('plain_text');
    expect(element.positive_button.text.text).toBe('Helpful');
  });

  it('should have negative button with value negative', () => {
    const element = feedbackBlock.elements[0];
    expect(element.negative_button).toBeDefined();
    expect(element.negative_button.value).toBe('negative');
    expect(element.negative_button.text.type).toBe('plain_text');
    expect(element.negative_button.text.text).toBe('Not helpful');
  });

  it('should have accessibility labels on both buttons', () => {
    const element = feedbackBlock.elements[0];
    expect(element.positive_button.accessibility_label).toBeDefined();
    expect(element.negative_button.accessibility_label).toBeDefined();
  });
});

