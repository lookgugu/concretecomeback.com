import test from 'node:test';
import assert from 'node:assert/strict';
import { syncListingTypeFields } from './submit-form.js';

function makeForm(selectedType) {
  const sections = ['park', 'shop', 'group'].map((listingSection) => {
    const controls = [{ disabled: false }, { disabled: false }];
    return {
      dataset: { listingSection },
      controls,
      querySelectorAll: () => controls,
    };
  });

  return {
    sections,
    querySelector: () => selectedType ? { value: selectedType } : null,
    querySelectorAll: () => sections,
  };
}

test('only controls for the selected listing type stay enabled', () => {
  const form = makeForm('shop');
  syncListingTypeFields(form);

  assert.deepEqual(
    form.sections.map((section) => ({
      type: section.dataset.listingSection,
      disabled: section.controls.map((control) => control.disabled),
    })),
    [
      { type: 'park', disabled: [true, true] },
      { type: 'shop', disabled: [false, false] },
      { type: 'group', disabled: [true, true] },
    ],
  );
});

test('all conditional controls are disabled before a type is selected', () => {
  const form = makeForm(null);
  syncListingTypeFields(form);

  assert.equal(
    form.sections.every((section) => section.controls.every((control) => control.disabled)),
    true,
  );
});
