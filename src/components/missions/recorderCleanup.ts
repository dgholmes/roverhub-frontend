/** Releases the microphone: stops a still-active recorder and every track of
 * its stream. Safe to call with nothing to release. */
export function releaseRecorder(rec: MediaRecorder | null, stream: MediaStream | null): void {
  if (rec && rec.state !== 'inactive') rec.stop()
  stream?.getTracks().forEach((tr) => tr.stop())
}

/** A recording that ends after the component unmounted must not upload or
 * report anything: nobody is there to receive it. */
export const shouldFinishRecording = (mounted: boolean): boolean => mounted

/** After `await getUserMedia`: if the component went away meanwhile, free the
 * freshly granted stream and tell the caller to stop. */
export function acceptGrantedStream(mounted: boolean, stream: MediaStream): boolean {
  if (mounted) return true
  releaseRecorder(null, stream)
  return false
}
