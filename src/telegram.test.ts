import { describe, it, expect } from 'vitest';

import { toTelegramHtml } from './telegram.js';

describe('toTelegramHtml', () => {
  // --- Bold conversion ---

  it('converts **double asterisks** to <b>', () => {
    expect(toTelegramHtml('hello **bold** world')).toBe('hello <b>bold</b> world');
  });

  it('converts *single asterisks* to <b>', () => {
    expect(toTelegramHtml('*bold text*')).toBe('<b>bold text</b>');
  });

  it('handles **nested in *single***: no double tags', () => {
    // **already double** → <b>
    expect(toTelegramHtml('**title**')).toBe('<b>title</b>');
  });

  // --- Italic ---

  it('converts _underscores_ to <i>', () => {
    expect(toTelegramHtml('_italic text_')).toBe('<i>italic text</i>');
  });

  it('does not convert underscores inside words (snake_case)', () => {
    expect(toTelegramHtml('snake_case_var')).toBe('snake_case_var');
  });

  // --- Headings ---

  it('converts ## headings to <b>', () => {
    expect(toTelegramHtml('## Option 1: Edit Project')).toBe('<b>Option 1: Edit Project</b>');
  });

  it('converts # h1 headings to <b>', () => {
    expect(toTelegramHtml('# Title')).toBe('<b>Title</b>');
  });

  it('handles ## **bold heading**', () => {
    expect(toTelegramHtml('## **My Title**')).toBe('<b><b>My Title</b></b>');
  });

  // --- Horizontal rules ---

  it('removes --- horizontal rules', () => {
    expect(toTelegramHtml('above\n---\nbelow')).toBe('above\n\nbelow');
  });

  // --- Code ---

  it('converts inline code to <code>', () => {
    expect(toTelegramHtml('use `dotenv` here')).toBe('use <code>dotenv</code> here');
  });

  it('strips language hints from code blocks', () => {
    const input = '```bash\necho hello\n```';
    expect(toTelegramHtml(input)).toBe('<pre>echo hello\n</pre>');
  });

  it('converts code blocks to <pre>', () => {
    const input = '```\necho hello\n```';
    expect(toTelegramHtml(input)).toBe('<pre>echo hello\n</pre>');
  });

  it('does not convert **bold** inside code blocks', () => {
    const input = '```\n**not bold**\n```';
    expect(toTelegramHtml(input)).toContain('**not bold**');
    expect(toTelegramHtml(input)).not.toContain('<b>');
  });

  it('does not convert **bold** inside inline code', () => {
    const result = toTelegramHtml('run `**test**` now');
    expect(result).toBe('run <code>**test**</code> now');
  });

  // --- HTML escaping ---

  it('escapes < > & in regular text', () => {
    expect(toTelegramHtml('a < b & c > d')).toBe('a &lt; b &amp; c &gt; d');
  });

  it('escapes HTML in code blocks', () => {
    const input = '```\n<script>alert(1)</script>\n```';
    expect(toTelegramHtml(input)).toContain('&lt;script&gt;');
  });

  it('escapes HTML in inline code', () => {
    expect(toTelegramHtml('use `<div>`')).toBe('use <code>&lt;div&gt;</code>');
  });

  // --- Links ---

  it('converts [text](url) to <a> tags', () => {
    expect(toTelegramHtml('[click here](https://example.com)')).toBe(
      '<a href="https://example.com">click here</a>',
    );
  });

  // --- Whitespace ---

  it('collapses 3+ blank lines into 2', () => {
    expect(toTelegramHtml('a\n\n\n\nb')).toBe('a\n\nb');
  });

  // --- Unbalanced chars are NOT an issue with HTML ---

  it('handles lone * without breaking', () => {
    const result = toTelegramHtml('3 * 4 = 12');
    // Should not crash or produce broken output
    expect(result).toBeTruthy();
  });

  it('handles lone _ without breaking (MY_VAR)', () => {
    const result = toTelegramHtml('set MY_VAR in env');
    expect(result).toBeTruthy();
  });

  // --- Real-world test: the failing agent response ---

  it('handles the coding factory response', () => {
    const input = [
      'I\'ve completed the documentation! Here\'s what\'s available:',
      '',
      '*Core Documentation:*',
      '- *README.md* - System overview, architecture',
      '- *implementation.md* - Complete working Python implementation',
      '- *GETTING-STARTED.md* - Fast 5-minute quick start guide',
      '',
      '*Setup Guides:*',
      '- *rag-setup.md* - Repository indexing with ChromaDB',
      '- *deployment.md* - Production deployment with Docker, vLLM',
      '',
      'The documentation covers:',
      '- Complete working code (LangGraph + Ollama + ChromaDB)',
      '- Four specialized agents (Planner, Coder, Reviewer, Tester)',
      '- Monitoring with Prometheus/Grafana',
      '',
      'You can start with GETTING-STARTED.md for the quickest path.',
    ].join('\n');

    const result = toTelegramHtml(input);

    // Bold sections converted
    expect(result).toContain('<b>Core Documentation:</b>');
    expect(result).toContain('<b>README.md</b>');
    expect(result).toContain('<b>GETTING-STARTED.md</b>');
    expect(result).toContain('<b>Setup Guides:</b>');
    // No raw asterisks for bold sections
    expect(result).not.toContain('*Core Documentation:*');
    expect(result).not.toContain('*README.md*');
  });

  it('handles the .env setup response', () => {
    const input = [
      'Good news! I\'ve added the placeholders to `/workspace/project/.env`.',
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
      '---',
      '',
      'Which approach would you like to use?',
    ].join('\n');

    const result = toTelegramHtml(input);

    // No raw ## headings
    expect(result).not.toMatch(/^##/m);
    // No ```bash
    expect(result).not.toContain('```bash');
    // No ---
    expect(result).not.toMatch(/^-{3,}$/m);
    // Inline code converted
    expect(result).toContain('<code>/workspace/project/.env</code>');
    // Code blocks converted
    expect(result).toContain('<pre>OPENROUTER_API_KEY=sk-or-v1-your-actual-key');
  });
});
