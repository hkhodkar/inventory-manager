import { HttpErrorResponse } from '@angular/common/http';
import { apiErrorMessage } from './api-error';

describe('apiErrorMessage', () => {
  it('uses a plain detail string from the API', () => {
    const error = new HttpErrorResponse({
      status: 409,
      error: { detail: 'A contact with email a@b.co already exists' },
    });
    expect(apiErrorMessage(error)).toBe('A contact with email a@b.co already exists');
  });

  it('turns the first validation issue into a sentence', () => {
    const error = new HttpErrorResponse({
      status: 422,
      error: {
        detail: [{ loc: ['body', 'amount'], msg: 'Input should be greater than 0' }],
      },
    });
    expect(apiErrorMessage(error)).toBe('amount: Input should be greater than 0');
  });

  it('strips the pydantic "Value error" prefix', () => {
    const error = new HttpErrorResponse({
      status: 422,
      error: { detail: [{ loc: ['body'], msg: 'Value error, Pick a contact or deal' }] },
    });
    expect(apiErrorMessage(error)).toBe('Pick a contact or deal');
  });

  it('explains network failures', () => {
    const error = new HttpErrorResponse({ status: 0 });
    expect(apiErrorMessage(error)).toContain('Cannot reach the server');
  });

  it('falls back for anything else', () => {
    expect(apiErrorMessage(new Error('boom'), 'Could not save')).toBe('Could not save');
  });
});
