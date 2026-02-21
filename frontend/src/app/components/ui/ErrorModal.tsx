import React from 'react';
import { AlertCircle } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';

interface ErrorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRetry?: () => void;
  errorCode?: string;
  message?: string;
  details?: string;
}

export function ErrorModal({ 
  isOpen, 
  onClose, 
  onRetry,
  errorCode = 'order_error',
  message = 'Failed to process request',
  details = 'An unexpected error occurred while processing your request. Please try again or contact support if the problem persists.'
}: ErrorModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-950 flex items-center justify-center">
            <AlertCircle className="w-5 h-5 text-[rgb(var(--color-error))]" />
          </div>
          <div>
            <h2 className="font-semibold">Order Error</h2>
            <p className="text-sm font-normal text-[rgb(var(--color-muted-foreground))]">Ошибка отправки приказа</p>
          </div>
        </div>
      }
      size="md"
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {onRetry && (
            <Button variant="destructive" onClick={onRetry}>
              Try Again
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        <div className="p-4 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20">
          <p className="font-medium text-red-900 dark:text-red-200 mb-2">{message}</p>
          <p className="text-sm text-red-700 dark:text-red-300">{details}</p>
        </div>

        <div>
          <p className="text-xs text-[rgb(var(--color-muted-foreground))] mb-2">Error Code</p>
          <code className="block px-3 py-2 rounded-lg bg-[rgb(var(--color-muted))] border border-[rgb(var(--color-border))] font-mono text-sm">
            {errorCode}
          </code>
        </div>

        <div className="flex gap-2">
          <Button variant="ghost" size="sm" className="flex-1">
            View Details
          </Button>
          <Button variant="ghost" size="sm" className="flex-1">
            Contact Support
          </Button>
        </div>
      </div>
    </Modal>
  );
}
