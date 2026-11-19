import { FormControl } from '@angular/forms';
import { notBlank, wholeNumber } from './validators';

describe('form validators', () => {
  it('wholeNumber allows empty and integer values only', () => {
    expect(wholeNumber(new FormControl<number | null>(null))).toBeNull();
    expect(wholeNumber(new FormControl<number | null>(12))).toBeNull();
    expect(wholeNumber(new FormControl<number | null>(1.5))).toEqual({ wholeNumber: true });
  });

  it('notBlank treats spaces as empty', () => {
    expect(notBlank(new FormControl('  ', { nonNullable: true }))).toEqual({ required: true });
    expect(notBlank(new FormControl(' SKU ', { nonNullable: true }))).toBeNull();
  });
});
