# Developer Guide

This document provides information for developers working on the OneNote to Obsidian Exporter.

## Recent Improvements (Phase 1: Testing Infrastructure)

### Refactoring for Testability

The codebase has been refactored to improve modularity and testability:

#### Module Extraction

**[src/parser.js](src/parser.js)** - Markdown Conversion
- Extracted from `exporter.js` (130 lines)
- Exports `createMarkdownConverter()` function
- Contains all Turndown rules for OneNote → Markdown conversion
- Fully testable without browser automation

**[src/linkResolver.js](src/linkResolver.js)** - Link Resolution
- Extracted from `exporter.js` (64 lines)
- Exports `resolveInternalLinks(pageIdMap, outputBase)` function
- Handles standard and fuzzy ID matching
- Manages comment cleanup for unresolved links

**Benefits:**
- `exporter.js` reduced by ~200 lines
- Improved separation of concerns
- Easier to test individual components
- Better code maintainability

## Testing

### Running Tests

The project uses [Jest](https://jestjs.io/) for unit testing.

```bash
# Run all tests
npm test

# Run tests in watch mode (auto-rerun on file changes)
npm test:watch

# Run tests with coverage report
npm test -- --coverage
```

### Test Structure

```
test/
├── parser.test.js         # Tests for HTML → Markdown conversion
└── linkResolver.test.js   # Tests for internal link resolution
```

### Test Coverage

**Total: 22 tests**

#### Parser Tests (11 tests)
- Local Images conversion to Obsidian format
- Local Files (PDF, Word docs) conversion
- Internal Links placeholder generation
- YouTube/Vimeo embed conversion
- Local video embedding
- Strikethrough formatting
- OneNote table junk removal
- OutlineContainer block separation
- GFM table conversion

#### Link Resolver Tests (11 tests)
- Standard ID matching (exact and encoded)
- Fuzzy ID matching (UUID extraction from OneNote's `{UUID}{1}` format)
- Directory links (sections/groups)
- Comment cleanup for unresolved links
- Multiple link processing
- Self-referencing link prevention

### Writing New Tests

When adding new features or modifying existing conversion logic:

1. **Add tests first** (TDD approach recommended)
2. **Test edge cases** - OneNote has many quirks
3. **Use descriptive test names** - `test('converts YouTube embeds to watch URLs')`
4. **Keep tests isolated** - Each test should be independent

Example test structure:
```javascript
describe('Feature Name', () => {
    test('specific behavior description', () => {
        const input = '<div>HTML input</div>';
        const expected = 'Expected output';
        const result = yourFunction(input);
        expect(result).toBe(expected);
    });
});
```

## Project Structure

```
src/
├── index.js           # CLI entry point
├── auth.js            # Microsoft authentication
├── config.js          # Configuration constants
├── navigator.js       # Notebook navigation
├── scrapers.js        # DOM scraping logic
├── parser.js          # HTML → Markdown conversion (NEW)
├── linkResolver.js    # Internal link resolution (NEW)
└── exporter.js        # Main export orchestration

test/
├── parser.test.js
└── linkResolver.test.js
```

## Development Workflow

### Making Changes

1. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make changes and add tests**
   - Modify code
   - Add/update tests to cover changes
   - Run `npm test` to verify

3. **Verify exports still work**
   ```bash
   node src/index.js export --notebook "Test Notebook"
   ```

4. **Commit with descriptive messages**
   ```bash
   git add .
   git commit -m "feat: add support for OneNote task checkboxes"
   ```

### Debugging

#### Enable Verbose Browser Mode
```bash
node src/index.js export --notheadless
```
This opens the browser visibly so you can watch the automation.

#### Dump HTML for Analysis
```bash
node src/index.js export --dodump
```
Saves HTML snapshots to `debug_*.html` files for inspection.

#### Test Individual Conversion
```javascript
const { createMarkdownConverter } = require('./src/parser');
const td = createMarkdownConverter();
const markdown = td.turndown('<your-html>');
console.log(markdown);
```

## Code Style

- Use **const/let** instead of var
- Use **arrow functions** for callbacks
- Use **async/await** for asynchronous code
- Add **JSDoc comments** for exported functions
- Keep functions **focused and small**

## Future Improvements

See [IMPROVEMENTS.md](IMPROVEMENTS.md) for planned enhancements:
- Parallel scraping for performance
- Incremental export (only changed pages)
- OCR text embedding
- OneNote tag conversion
- Docker support

For detailed implementation plans, see the `implementation_plan.md` artifact in the `.gemini` directory.

## Troubleshooting

### Tests Failing with Permission Errors

If you see `EPERM: operation not permitted` errors:
- Tests create temporary files in `.test-temp/` directory
- Ensure you have write permissions in the project directory
- On restricted systems, tests may fail (but the export tool itself will work)

### Node Version Issues

Ensure you're using Node.js 18.x or higher:
```bash
node -v  # Should be v18.0.0 or higher
```

### Playwright Browser Issues

If Playwright can't find browsers:
```bash
npx playwright install chromium
```

## Contributing

When contributing:
1. Ensure all tests pass (`npm test`)
2. Add tests for new functionality
3. Update documentation as needed
4. Follow the existing code style
5. Write clear commit messages
