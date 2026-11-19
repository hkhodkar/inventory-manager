import { Pipe, PipeTransform } from '@angular/core';
import { MoneyFormat, formatMoney } from '../../core/utils/format';

@Pipe({ name: 'money' })
export class MoneyPipe implements PipeTransform {
  transform(value: number | null | undefined, format: MoneyFormat = 'whole'): string {
    return formatMoney(value, format);
  }
}
