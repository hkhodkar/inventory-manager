import { AbstractControl, ValidationErrors } from '@angular/forms';

/** Accepts empty values and whole numbers, like an <input type="number" step="1">. */
export function wholeNumber(control: AbstractControl<number | null>): ValidationErrors | null {
  const value = control.value;
  return value === null || Number.isInteger(value) ? null : { wholeNumber: true };
}

/** Text that is only spaces counts as empty for required fields. */
export function notBlank(control: AbstractControl<string>): ValidationErrors | null {
  return control.value.trim() ? null : { required: true };
}
