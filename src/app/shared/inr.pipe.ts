import { Pipe, PipeTransform } from '@angular/core';

const fmt = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

/** 2000 → "₹2,000" */
@Pipe({ name: 'inr' })
export class InrPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    return value == null ? '' : fmt.format(value);
  }
}
