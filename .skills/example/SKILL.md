---
name: example_skill
description: A sample skill demonstrating the Agent Skills format
version: 1.0.0
author: Orion Team
tools:
  - name: greet_user
    description: Generate a personalized greeting
    parameters:
      name:
        type: string
        description: Name of the person to greet
        required: true
      style:
        type: string
        description: Greeting style (formal, casual, enthusiastic)
        enum:
          - formal
          - casual
          - enthusiastic
---

# Example Skill

This is a demonstration skill showing the Agent Skills format.

## When to Use

Use this skill when you need to:
- Generate personalized greetings
- Demonstrate skill loading works correctly

## Guidelines

1. Always use the user's name when greeting
2. Match the greeting style to the context
3. Keep responses friendly and professional

## Example Interactions

**Casual greeting:**
> "Hey {name}, what's up?"

**Formal greeting:**
> "Good day, {name}. How may I assist you?"

**Enthusiastic greeting:**
> "Hi {name}! Great to see you! How can I help?"

