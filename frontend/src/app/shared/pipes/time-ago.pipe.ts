import { Pipe, PipeTransform } from '@angular/core';
import { timeAgo } from '../../core/utils/format';

@Pipe({ name: 'timeAgo' })
export class TimeAgoPipe implements PipeTransform {
  transform(value: string): string {
    return timeAgo(value);
  }
}
