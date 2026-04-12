export function getStatusTone(status: string): 'green' | 'yellow' | 'red' | 'blue' | 'gray' {
  switch (status) {
    case 'delivered':
      return 'green';
    case 'in_transit':
      return 'blue';
    case 'delayed':
      return 'red';
    case 'pending':
      return 'yellow';
    default:
      return 'gray';
  }
}
