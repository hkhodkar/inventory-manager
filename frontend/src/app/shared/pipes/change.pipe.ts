import { Pipe, PipeTransform } from '@angular/core';
import { formatChange } from '../../core/utils/format';

@Pipe({ name: 'change' })
export class ChangePipe implements PipeTransform {
  transform(value: number): string {
    return formatChange(value);
  }
}
