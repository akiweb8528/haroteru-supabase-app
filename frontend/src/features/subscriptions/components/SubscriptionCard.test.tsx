import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { SubscriptionCard } from './SubscriptionCard';
import type { TrackedSubscription } from '@/types';

// SubscriptionForm は編集モードで表示されるが、このテストでは対象外のため stub 化
vi.mock('./SubscriptionForm', () => ({
  SubscriptionForm: () => <div data-testid="subscription-form" />,
}));

const mockUsePreferences = vi.fn(() => ({
  taste: 'ossan',
}));

vi.mock('@/providers/PreferencesProvider', () => ({
  usePreferences: () => mockUsePreferences(),
}));

const baseSubscription: TrackedSubscription = {
  id: 'sub-1',
  userId: 'user-1',
  name: 'Netflix',
  amountYen: 1490,
  billingCycle: 'monthly',
  category: 'video',
  reviewPriority: 'medium',
  locked: false,
  note: '',
  position: 0,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

describe('SubscriptionCard', () => {
  const onUpdate = vi.fn().mockResolvedValue(baseSubscription);
  const onDelete = vi.fn().mockResolvedValue(undefined);
  const onReorder = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePreferences.mockReturnValue({ taste: 'ossan' });
  });

  it('サービス名・金額・カテゴリを表示する', () => {
    render(<SubscriptionCard subscription={baseSubscription} onUpdate={onUpdate} onDelete={onDelete} />);

    expect(screen.getByText('Netflix')).toBeInTheDocument();
    expect(screen.getByText(/1,490/)).toBeInTheDocument(); // 金額（円記号は環境依存なので数字で確認）
    expect(screen.getByText('動画')).toBeInTheDocument();
    // 「¥1,490 / 月額」は同一 <p> 内にテキストノードが混在するため部分一致で確認
    expect(screen.getByText(/月額/)).toBeInTheDocument();
  });

  it('locked=true のとき「ロック中」バッジを表示し、削除ボタンを表示しない', () => {
    render(
      <SubscriptionCard
        subscription={{ ...baseSubscription, locked: true }}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />,
    );
    expect(screen.getByText('ロック中')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '削除' })).not.toBeInTheDocument();
  });

  it('locked=false のとき「ロック中」バッジを表示せず、削除ボタンを表示する', () => {
    render(<SubscriptionCard subscription={baseSubscription} onUpdate={onUpdate} onDelete={onDelete} />);
    expect(screen.queryByText('ロック中')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '削除' })).toBeInTheDocument();
  });

  it('note がある場合に表示する', () => {
    render(
      <SubscriptionCard
        subscription={{ ...baseSubscription, note: '家族プランで利用中' }}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />,
    );
    expect(screen.getByText('家族プランで利用中')).toBeInTheDocument();
  });

  it('長い note は省略表示し、詳細を見るで展開できる', () => {
    const longNote = 'a'.repeat(140);

    render(
      <SubscriptionCard
        subscription={{ ...baseSubscription, note: longNote }}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />,
    );

    expect(screen.getByRole('button', { name: '詳細を見る' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '詳細を見る' }));

    expect(screen.getByRole('button', { name: '閉じる' })).toBeInTheDocument();
    expect(screen.getByText(longNote)).toBeInTheDocument();
  });

  it('カテゴリ未設定のときカテゴリバッジを表示しない', () => {
    render(
      <SubscriptionCard
        subscription={{ ...baseSubscription, category: undefined }}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />,
    );
    expect(screen.queryByText('動画')).not.toBeInTheDocument();
  });

  it('鍵ボタンを押すとロック状態を即時更新する', async () => {
    render(<SubscriptionCard subscription={baseSubscription} onUpdate={onUpdate} onDelete={onDelete} />);

    fireEvent.click(screen.getByRole('button', { name: 'ロックする' }));

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledWith('sub-1', { locked: true });
    });
  });

  it('「削除」ボタンをクリックすると確認ダイアログが表示される', () => {
    render(<SubscriptionCard subscription={baseSubscription} onUpdate={onUpdate} onDelete={onDelete} />);

    fireEvent.click(screen.getByRole('button', { name: '削除' }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText(/削除の確認/)).toBeInTheDocument();
    // ダイアログ内に「Netflix」が含まれること（カード見出しと重複するため within で絞る）
    expect(within(dialog).getByText(/Netflix/)).toBeInTheDocument();
  });

  it('ダイアログで「キャンセル」するとダイアログが閉じる', () => {
    render(<SubscriptionCard subscription={baseSubscription} onUpdate={onUpdate} onDelete={onDelete} />);

    fireEvent.click(screen.getByRole('button', { name: '削除' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('ダイアログで「削除する」を押すと onDelete が呼ばれる', async () => {
    render(<SubscriptionCard subscription={baseSubscription} onUpdate={onUpdate} onDelete={onDelete} />);

    fireEvent.click(screen.getByRole('button', { name: '削除' }));
    fireEvent.click(screen.getByRole('button', { name: '削除する' }));

    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledWith('sub-1');
    });
  });

  it('「編集」ボタンをクリックすると SubscriptionForm が表示される', () => {
    render(<SubscriptionCard subscription={baseSubscription} onUpdate={onUpdate} onDelete={onDelete} />);

    fireEvent.click(screen.getByRole('button', { name: '編集' }));

    expect(screen.getByTestId('subscription-form')).toBeInTheDocument();
  });

  it('simple テイストではカードクリックで SubscriptionForm が表示される', () => {
    mockUsePreferences.mockReturnValue({ taste: 'simple' });

    render(<SubscriptionCard subscription={baseSubscription} onUpdate={onUpdate} onDelete={onDelete} />);

    fireEvent.click(screen.getByRole('button', { name: 'Netflix を編集' }));

    expect(screen.getByTestId('subscription-form')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '編集' })).not.toBeInTheDocument();
  });

  it('simple テイストではロックボタンを押しても編集モードに入らない', async () => {
    mockUsePreferences.mockReturnValue({ taste: 'simple' });

    render(<SubscriptionCard subscription={baseSubscription} onUpdate={onUpdate} onDelete={onDelete} />);

    fireEvent.click(screen.getByRole('button', { name: 'ロックする' }));

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledWith('sub-1', { locked: true });
    });
    expect(screen.queryByTestId('subscription-form')).not.toBeInTheDocument();
  });

  it('simple テイストではロック中バッジを表示しない', () => {
    mockUsePreferences.mockReturnValue({ taste: 'simple' });

    render(
      <SubscriptionCard
        subscription={{ ...baseSubscription, locked: true }}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />,
    );

    expect(screen.queryByText('ロック中')).not.toBeInTheDocument();
  });

  it('並び替え可能なとき左側にドラッグハンドルを表示する', () => {
    render(
      <SubscriptionCard
        subscription={baseSubscription}
        onUpdate={onUpdate}
        onDelete={onDelete}
        canReorder
        onDragStart={onReorder}
      />,
    );

    expect(screen.getByRole('button', { name: 'ドラッグして並び替える' })).toBeInTheDocument();
  });
});
