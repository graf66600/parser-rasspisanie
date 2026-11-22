const groups = ['31ф', '32ф', '33ф', '31фм', '41ф', '42ф', '43ф', '51ф'];

module.exports = groups.map(group => {
  const days = Array.from({ length: 6 }, (_, index) => {
    const day = index + 1;
    const last = day === 6 && group !== '42ф' ? 6 : 7;
    return `${day}|1-${last}|пп`;
  });
  return [`@${group}`, ...days].join('\n');
}).join('\n');
