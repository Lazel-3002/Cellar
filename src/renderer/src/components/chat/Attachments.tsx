import { useState } from 'react';
import { FileText, Image as ImageIcon, X } from 'lucide-react';
import { Dialog as RadixDialog } from 'radix-ui';
import type { AttachmentRef } from '@shared/types/chat';
import { cn, formatBytes } from '@/lib/utils';

export const attachmentImageUrl = (id: string) => `cellar-attachment://image/${encodeURIComponent(id)}`;

/** An attached image; falls back to an icon when the file is gone. */
export function AttachmentImage({ attachment, className, onClick }: { attachment: AttachmentRef; className?: string; onClick?: () => void }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span className={cn('flex items-center justify-center bg-selected text-muted-foreground', className)} title={attachment.name}>
        <ImageIcon className="size-4" />
      </span>
    );
  }
  return (
    <img
      src={attachmentImageUrl(attachment.id)}
      alt={attachment.name}
      title={attachment.name}
      draggable={false}
      onError={() => setFailed(true)}
      onClick={onClick}
      className={cn('object-cover', onClick && 'cursor-zoom-in', className)}
    />
  );
}

function Lightbox({ attachment, onClose }: { attachment: AttachmentRef | null; onClose: () => void }) {
  return (
    <RadixDialog.Root open={!!attachment} onOpenChange={(open) => !open && onClose()}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-black/80 animate-fade-in" />
        <RadixDialog.Content className="fixed inset-0 z-50 flex items-center justify-center p-10 outline-none" onClick={onClose}>
          <RadixDialog.Title className="sr-only">{attachment?.name ?? 'Image'}</RadixDialog.Title>
          <RadixDialog.Description className="sr-only">Attached image</RadixDialog.Description>
          {attachment && <img src={attachmentImageUrl(attachment.id)} alt={attachment.name} className="max-h-full max-w-full rounded-lg object-contain shadow-2xl" />}
          <RadixDialog.Close aria-label="Close" className="absolute top-12 right-6 flex size-8 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80">
            <X className="size-4" />
          </RadixDialog.Close>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

/** Attachments of a sent message: image thumbnails (click to enlarge) and file chips. */
export function MessageAttachments({ attachments, className }: { attachments: AttachmentRef[]; className?: string }) {
  const [open, setOpen] = useState<AttachmentRef | null>(null);
  if (attachments.length === 0) return null;
  const images = attachments.filter((a) => a.kind === 'image');
  const files = attachments.filter((a) => a.kind !== 'image');
  return (
    <div className={cn('flex max-w-[85%] flex-col items-end gap-2', className)} data-testid="message-attachments">
      {images.length > 0 && (
        <div className="flex flex-wrap justify-end gap-2">
          {images.map((a) => (
            <AttachmentImage
              key={a.id}
              attachment={a}
              onClick={() => setOpen(a)}
              className={cn('rounded-xl border border-composer-border', images.length === 1 ? 'max-h-72 max-w-[min(420px,100%)] object-contain' : 'size-32')}
            />
          ))}
        </div>
      )}
      {files.length > 0 && (
        <div className="flex flex-wrap justify-end gap-2">
          {files.map((a) => (
            <div key={a.id} className="flex h-11 items-center gap-2 rounded-xl border border-composer-border bg-composer px-2.5 text-[12.5px]">
              <FileText className="size-4 text-muted-foreground" />
              <div>
                <div className="max-w-44 truncate text-foreground">{a.name}</div>
                <div className="text-[11px] text-muted-foreground">{formatBytes(a.size)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      <Lightbox attachment={open} onClose={() => setOpen(null)} />
    </div>
  );
}
