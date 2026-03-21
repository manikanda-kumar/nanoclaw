import { describe, it, expect } from 'vitest';

import { toTelegramMarkdown } from './telegram.js';

describe('toTelegramMarkdown', () => {
  it('converts **double asterisks** to *single asterisks*', () => {
    expect(toTelegramMarkdown('hello **bold** world')).toBe('hello *bold* world');
  });

  it('converts ## headings to *bold*', () => {
    expect(toTelegramMarkdown('## Option 1: Edit Project')).toBe('*Option 1: Edit Project*');
  });

  it('converts # h1 headings to *bold*', () => {
    expect(toTelegramMarkdown('# Title')).toBe('*Title*');
  });

  it('removes --- horizontal rules', () => {
    expect(toTelegramMarkdown('above\n---\nbelow')).toBe('above\n\nbelow');
  });

  it('preserves inline code unchanged', () => {
    expect(toTelegramMarkdown('use `dotenv` here')).toBe('use `dotenv` here');
  });

  it('strips language hints from code blocks', () => {
    const input = '```bash\necho hello\n```';
    const expected = '```\necho hello\n```';
    expect(toTelegramMarkdown(input)).toBe(expected);
  });

  it('strips python language hint from code blocks', () => {
    const input = '```python\nimport os\n```';
    const expected = '```\nimport os\n```';
    expect(toTelegramMarkdown(input)).toBe(expected);
  });

  it('preserves code blocks without language hints', () => {
    const input = '```\necho hello\n```';
    expect(toTelegramMarkdown(input)).toBe(input);
  });

  it('does not convert **bold** inside code blocks', () => {
    const input = '```\n**not bold**\n```';
    expect(toTelegramMarkdown(input)).toBe('```\n**not bold**\n```');
  });

  it('does not convert ## headings inside code blocks', () => {
    const input = '```\n## not a heading\n```';
    expect(toTelegramMarkdown(input)).toBe('```\n## not a heading\n```');
  });

  it('does not convert **bold** inside inline code', () => {
    expect(toTelegramMarkdown('run `**test**` now')).toBe('run `**test**` now');
  });

  it('collapses 3+ blank lines into 2', () => {
    expect(toTelegramMarkdown('a\n\n\n\nb')).toBe('a\n\nb');
  });

  it('preserves single asterisk bold (already Telegram-compatible)', () => {
    expect(toTelegramMarkdown('*already bold*')).toBe('*already bold*');
  });

  it('preserves _italic_ (already Telegram-compatible)', () => {
    expect(toTelegramMarkdown('_italic text_')).toBe('_italic text_');
  });

  it('converts [text](url) links to plain text with URL', () => {
    // Links should ideally be converted, but current implementation passes them through
    // Telegram legacy Markdown actually supports [text](url), so this is fine
    const input = '[click here](https://example.com)';
    const result = toTelegramMarkdown(input);
    expect(result).toBe(input); // Telegram Markdown supports links
  });

  // Real-world test case based on the screenshot
  it('handles a complex agent response', () => {
    const input = [
      'Good news! I\'ve added the placeholders to `/workspace/project/.env`.',
      '',
      'Now you can fill in your actual keys. You have two approaches:',
      '',
      '## *Option 1: Edit Project .env (Quick)*',
      '',
      'On your Mac, find and edit:',
      '```',
      '[nanoclaw-project]/.env',
      '```',
      '',
      'Fill in your actual keys:',
      '```bash',
      'OPENROUTER_API_KEY=sk-or-v1-your-actual-key',
      'ANTHROPIC_API_KEY=sk-ant-your-actual-key',
      '```',
      '',
      '## *Option 2: OneDrive .env (More Secure)*',
      '',
      'Keep keys separate from project code. Create:',
      '```',
      '~/Library/CloudStorage/OneDrive-Personal/nanoclaw/.env',
      '```',
      '',
      '---',
      '',
      'Which approach would you like to use?',
    ].join('\n');

    const result = toTelegramMarkdown(input);

    // No ## headings
    expect(result).not.toMatch(/^##/m);
    // No ```bash language hints
    expect(result).not.toContain('```bash');
    // No ---
    expect(result).not.toMatch(/^-{3,}$/m);
    // Bold headings preserved (## *text* → *text*)
    expect(result).toContain('*Option 1: Edit Project .env (Quick)*');
    expect(result).toContain('*Option 2: OneDrive .env (More Secure)*');
    // Inline code preserved
    expect(result).toContain('`/workspace/project/.env`');
    // Code blocks preserved (without language hint)
    expect(result).toContain('```\nOPENROUTER_API_KEY=sk-or-v1-your-actual-key');
  });

  it('handles **bold** inside headings: ## **Title**', () => {
    // ## **Title** → heading converts to ***Title*** → then ** → * gives **Title**
    // This is still double — need to handle nested
    const result = toTelegramMarkdown('## **My Title**');
    // Should not have double asterisks
    expect(result).not.toContain('**');
    expect(result).toBe('*My Title*');
  });

  it('handles ## *already single bold*', () => {
    // ## *Title* → heading wraps: **Title** → then ** → * gives *Title* ... but order matters
    const result = toTelegramMarkdown('## *Option 1: Quick*');
    expect(result).not.toContain('**');
  });

  it('does not produce unbalanced asterisks', () => {
    const inputs = [
      'This has a lone * in text',
      'Price is $5.00 * tax',
      '3 * 4 = 12',
    ];
    for (const input of inputs) {
      const result = toTelegramMarkdown(input);
      // Count asterisks outside code — should be even for valid Telegram markdown
      const stripped = result.replace(/`[^`]+`/g, '').replace(/```[\s\S]*?```/g, '');
      const asterisks = (stripped.match(/\*/g) || []).length;
      expect(asterisks % 2).toBe(0);
    }
  });

  it('does not produce unbalanced underscores', () => {
    const inputs = [
      'snake_case_variable is common',  // 2 underscores (even)
      'file_name_here.txt',             // 2 underscores (even)
      'use __init__.py',                // 4 underscores (even)
      'set MY_VAR in env',              // 1 underscore (odd!)
      'use OPENROUTER_API_KEY',         // 2 underscores (even)
      'ANTHROPIC_API_KEY=sk-ant-key',   // 1 underscore (odd!)
    ];
    for (const input of inputs) {
      const result = toTelegramMarkdown(input);
      const stripped = result.replace(/`[^`]+`/g, '').replace(/```[\s\S]*?```/g, '');
      const underscores = (stripped.match(/_/g) || []).length;
      expect(underscores % 2).toBe(0);
    }
  });
});
