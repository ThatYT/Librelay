import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@heroui/input";
import { Button } from "@heroui/button";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import toast from "@/utils/toast";
import { updateInboundPort } from "@/api";

export default function ProtocolPortButton({ entry, onSaved }: { entry: { id: number; listenPort: number }; onSaved: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [port, setPort] = useState(String(entry.listenPort));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) return toast.error(t("port.range"));
    setBusy(true);
    try {
      const response = await updateInboundPort(entry.id, Number(port));
      if (response.code !== 0) return toast.error(response.msg || t("port.failed"));
      toast.success(t("port.updated")); setOpen(false); onSaved();
    } catch { toast.error(t("port.failed")); }
    finally { setBusy(false); }
  };
  return <><button className="ml-2 underline" onClick={() => { setPort(String(entry.listenPort)); setOpen(true); }}>{t("port.edit")}</button>
    <Modal isOpen={open} onClose={() => setOpen(false)}><ModalContent>
      <ModalHeader>{t("port.title")}</ModalHeader><ModalBody>
        <Input label={t("port.label")} type="number" min={1} max={65535} value={port} onValueChange={setPort} />
        <p className="text-sm text-default-500">{t("port.legacy")}</p>
      </ModalBody><ModalFooter><Button onPress={() => setOpen(false)}>{t("button.cancel")}</Button>
        <Button color="primary" isLoading={busy} onPress={save}>{t("button.save")}</Button></ModalFooter>
    </ModalContent></Modal>
  </>;
}
