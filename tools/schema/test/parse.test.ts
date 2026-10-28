// SPDX-License-Identifier: MIT

/**
 * What the parser takes from the page, and what it leaves.
 *
 * Built from a page of a few sections rather than the real one, so each case
 * shows one rule. The rule here is the one a one-word heading in the
 * introduction broke: prose about using the API is not part of it.
 */

import { describe, expect, it } from 'vitest'
import { parseBotApi } from '../src/bot-api/parse.js'

const PAGE = `<html><body>
<h3>Recent changes</h3>
<h4><a class="anchor" name="august-24-2026"></a>August 24, 2026</h4>
<p><strong>Bot API 10.3</strong></p>
<h3>Making requests</h3>
<h4><a class="anchor" name="errors"></a>Errors</h4>
<p>The errors each method can return are listed in errors.json.</p>
<h3>Available types</h3>
<h4><a class="anchor" name="thing"></a>Thing</h4>
<p>This object represents a thing.</p>
<table><thead><tr><th>Field</th><th>Type</th><th>Description</th></tr></thead>
<tbody><tr><td>id</td><td>Integer</td><td>Its identifier.</td></tr></tbody></table>
<h3>Available methods</h3>
<h4><a class="anchor" name="getthing"></a>getThing</h4>
<p>Use this method to get a thing. Returns a <a href="#thing">Thing</a> object on success.</p>
<table><thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
<tbody><tr><td>id</td><td>Integer</td><td>Yes</td><td>Which one.</td></tr></tbody></table>
</body></html>`

describe('the parts of the page that define the API', () => {
  const schema = parseBotApi(PAGE, 'https://core.telegram.org/bots/api')

  it('takes objects and methods from the sections that define them', () => {
    expect(schema.objects.map((object) => object.name)).toEqual(['Thing'])
    expect(schema.methods.map((method) => method.name)).toEqual(['getThing'])
  })

  it('leaves a one-word heading in the introduction as the prose it is', () => {
    expect(schema.objects.find((object) => object.name === 'Errors')).toBeUndefined()
  })

  it('still reads the version and date from the changelog it skips', () => {
    expect(schema.version).toBe('10.3')
    expect(schema.releasedAt).toBe('august-24-2026')
  })
})
