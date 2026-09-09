/**
 * Disable controls in listing-type sections that are not currently active.
 * Disabled controls are omitted from native form submission.
 *
 * @param {HTMLFormElement} form
 */
export function syncListingTypeFields(form) {
  const selected = form.querySelector('input[name="listing-type"]:checked')?.value;

  form.querySelectorAll('[data-listing-section]').forEach((section) => {
    const isActive = section.dataset.listingSection === selected;
    section.querySelectorAll('input, select, textarea').forEach((control) => {
      control.disabled = !isActive;
    });
  });
}

/**
 * @param {HTMLFormElement} form
 */
export function initListingTypeFields(form) {
  form.querySelectorAll('input[name="listing-type"]').forEach((radio) => {
    radio.addEventListener('change', () => syncListingTypeFields(form));
  });
  syncListingTypeFields(form);
}
