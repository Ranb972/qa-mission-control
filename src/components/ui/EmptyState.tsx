type EmptyStateProps = {
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      <p>{description}</p>

      {actionLabel && onAction ? (
        <div className="button-row">
          <button
            type="button"
            className="button button--secondary"
            onClick={onAction}
          >
            {actionLabel}
          </button>
        </div>
      ) : null}
    </div>
  )
}
