import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import { Button } from "@heroui/button";
import { Spinner } from "@heroui/spinner";
import { Chip } from "@heroui/chip";
import { getUserProtocolAccess, saveUserProtocolAccess, ProtocolAccessSnapshot, ProtocolAccessEntry } from "@/api";
import toast, { serverMessage } from "@/utils/toast";

export default function UserProtocolAccess({ userId, name, onClose, onSaved }: {
  userId: number | null; name: string; onClose: () => void; onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [snapshot, setSnapshot] = useState<ProtocolAccessSnapshot | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ context: string; message: string }[]>([]);
  const adopt = (data: ProtocolAccessSnapshot) => {
    setSnapshot(data); setSelected(new Set(data.protocols.filter(p => p.selected).map(p => p.id)));
  };
  const reload = async () => {
    setLoading(true); setErrors([]);
    try {
      const res = await getUserProtocolAccess(userId);
      if (res.code !== 0) throw new Error(res.msg);
      adopt(res.data);
    } catch (error) { setErrors([{ context: "", message: error instanceof Error ? error.message : t("access.failed") }]); }
    finally { setLoading(false); }
  };
  useEffect(() => { reload(); }, [userId]);
  const toggle = (ids: number[], value: boolean) => setSelected(previous => {
    const next = new Set(previous);
    ids.forEach(id => value ? next.add(id) : next.delete(id)); return next;
  });
  const save = async () => {
    if (!snapshot) return;
    const removed = snapshot.protocols.filter(p => p.selected && !selected.has(p.id)).length;
    if (removed && !window.confirm(t("access.confirmRevoke", { count: removed }))) return;
    setLoading(true); setErrors([]);
    try {
      const res = await saveUserProtocolAccess(userId, Array.from(selected), snapshot.revision);
      if (res.code !== 0) throw new Error(res.msg);
      adopt(res.data);
      const failures = (res.data.outcomes || []).filter((item: any) => !item.success);
      setErrors(failures.map((item: any) => {
        const protocol = res.data.protocols.find((p: ProtocolAccessEntry) => p.id === item.inboundId);
        return { context: `${protocol?.nodeName || item.nodeId} / ${protocol?.protocol || item.inboundId}`, message: item.error };
      }));
      if (!failures.length) toast.success(t("access.saved"));
      onSaved();
    } catch (error) { setErrors([{ context: "", message: error instanceof Error ? error.message : t("access.failed") }]); }
    finally { setLoading(false); }
  };
  const groups = new Map<string, ProtocolAccessEntry[]>();
  snapshot?.protocols.forEach(p => {
    const key = `${p.nodeId}:${p.landingId ?? "direct"}`;
    groups.set(key, [...(groups.get(key) || []), p]);
  });
  return <Modal isOpen onClose={onClose} isDismissable={!loading} hideCloseButton isKeyboardDismissDisabled={loading} size="3xl" scrollBehavior="inside">
    <ModalContent>
      <ModalHeader>{t("access.title")} — {name}</ModalHeader>
      <ModalBody>
        <p className="text-sm text-default-500">{t("access.description")}</p>
        {loading && <Spinner />}
        {!loading && snapshot?.protocols.length === 0 && <p>{t("access.empty")}</p>}
        {Array.from(groups.entries()).map(([key, protocols]) => {
          const p = protocols[0];
          const selectable = protocols.filter(item => item.enabled || item.selected).map(item => item.id);
          const all = selectable.length > 0 && selectable.every(id => selected.has(id));
          const some = selectable.some(id => selected.has(id));
          return <div key={key} className="border border-default-200 rounded-lg p-3 space-y-2">
            <label className="flex items-center gap-2 font-medium"><input type="checkbox" disabled={loading || !selectable.length} checked={all}
              ref={input => { if (input) input.indeterminate = some && !all; }} onChange={event => toggle(selectable, event.target.checked)} />
              {p.nodeName} · {p.landingId == null ? t("access.direct") : `${t("access.relay")} → ${p.landingName || p.landingId}`}
            </label>
            {protocols.map(item => <div key={item.id} className="flex flex-wrap items-center gap-2 pl-6">
              <label className="flex items-center gap-2"><input type="checkbox" disabled={loading || (!item.enabled && !item.selected)} checked={selected.has(item.id)}
                onChange={event => toggle([item.id], event.target.checked)} />
                {item.protocol.toUpperCase()}{item.security && item.security !== "none" ? ` / ${item.security}` : ""} : {item.listenPort}
                {item.remark ? ` · ${item.remark}` : ""}
              </label>
              {!item.enabled && <Chip size="sm">{t("access.disabled")}</Chip>}
              {item.paused && <Chip size="sm">{t("access.paused")}</Chip>}
              {item.pending && <Chip size="sm" color="warning">{t(`access.pending.${item.pending}`)}</Chip>}
            </div>)}
          </div>;
        })}
        {snapshot?.protocols.some(p => p.pending === "revoke") && <p className="text-warning text-sm">{t("access.revokeWarning")}</p>}
        {errors.length > 0 && <div role="alert" className="text-danger text-sm space-y-1">
          <p>{t("access.retryHelp")}</p>{errors.map((error, i) => <p key={i}>{error.context ? `${error.context}: ` : ""}{serverMessage(error.message)}</p>)}
        </div>}
      </ModalBody>
      <ModalFooter>
        <Button variant="light" isDisabled={loading} onPress={onClose}>{t("access.close")}</Button>
        <Button variant="flat" isDisabled={loading} onPress={reload}>{t("access.reload")}</Button>
        <Button color="primary" isLoading={loading} isDisabled={!snapshot || loading} onPress={save}>{t("access.save")}</Button>
      </ModalFooter>
    </ModalContent>
  </Modal>;
}
