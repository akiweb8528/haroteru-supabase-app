import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SubscriptionForm } from './SubscriptionForm';

vi.mock('@/providers/PreferencesProvider', () => ({
  usePreferences: () => ({
    taste: 'simple',
  }),
}));

describe('SubscriptionForm', () => {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const onCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('サービス名で Enter を押すと金額へフォーカスが移る', () => {
    render(<SubscriptionForm onSubmit={onSubmit} onCancel={onCancel} />);

    const nameInput = screen.getByLabelText('サービス名');
    const amountInput = screen.getByLabelText('金額');

    fireEvent.keyDown(nameInput, { key: 'Enter' });

    expect(amountInput).toHaveFocus();
  });

  it('カテゴリで Enter を押すとメモへフォーカスが移る', () => {
    render(<SubscriptionForm onSubmit={onSubmit} onCancel={onCancel} />);

    const categorySelect = screen.getByLabelText('カテゴリ');
    const noteInput = screen.getByLabelText('メモ');

    fireEvent.keyDown(categorySelect, { key: 'Enter' });

    expect(noteInput).toHaveFocus();
  });

  it('金額で Enter を押すとメモへフォーカスが移る', () => {
    render(<SubscriptionForm onSubmit={onSubmit} onCancel={onCancel} />);

    const amountInput = screen.getByLabelText('金額');
    const noteInput = screen.getByLabelText('メモ');

    fireEvent.keyDown(amountInput, { key: 'Enter' });

    expect(noteInput).toHaveFocus();
  });

  it('メモで Enter を押しても送信しない', async () => {
    render(<SubscriptionForm onSubmit={onSubmit} onCancel={onCancel} />);

    fireEvent.keyDown(screen.getByLabelText('メモ'), { key: 'Enter' });

    await waitFor(() => {
      expect(onSubmit).not.toHaveBeenCalled();
    });
  });
});
