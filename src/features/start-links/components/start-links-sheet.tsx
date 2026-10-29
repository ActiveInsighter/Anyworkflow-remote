import { Modal, ModalBody, ModalContent, ModalDescription, ModalHeader, ModalTitle } from '@/components/ui/modal'
import { useStartLinksDraft } from '../hooks/use-start-links-draft'
import { StartLinksEditor } from './start-links-editor'

/** The start-link editor as a sheet, opened from the Run editor's start-page menu. */
export function StartLinksSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Modal open={open} onOpenChange={(next) => onOpenChange(next)}>
      <ModalContent size="lg">
        <ModalHeader>
          <ModalTitle>快捷链接</ModalTitle>
          <ModalDescription className="text-muted-foreground">设置 start_url 时可直接选择，所有设备同步。</ModalDescription>
        </ModalHeader>
        <ModalBody>{open ? <StartLinksSheetBody /> : null}</ModalBody>
      </ModalContent>
    </Modal>
  )
}

/** Mounted only while open, so every opening starts from the saved list. */
function StartLinksSheetBody() {
  const draft = useStartLinksDraft()
  return <StartLinksEditor draft={draft} />
}
