import { Text } from '@/ui';
import type { ReactNode } from 'react';

/** The name of a question or of a group of answers, in bold above them. */
export function QuestionTitle({ children }: { children: ReactNode }) {
  return (
    <Text>
      <strong>{children}</strong>
    </Text>
  );
}
