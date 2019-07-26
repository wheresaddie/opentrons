// @flow
import * as React from 'react'

import { AlertModal } from '@opentrons/components'
import styles from './styles.css'

type Props = {
  parentUrl: string,
  ignoreUpdate: () => mixed,
}

export default function InstallModal(props: Props) {
  return (
    <AlertModal heading="Robot Update Step 1 of 2" alertOverlay>
      <div className={styles.system_update_modal}>
        <p className={styles.update_message}>
          Robot Server update in progress...
        </p>
        <ProgressSpinner />
        <p className={styles.update_warning}>
          Hang tight! This may take 3-5 minutes.
        </p>
        <p>Your OT-2 will reboot once robot server update is complete.</p>
      </div>
    </AlertModal>
  )
}

function ProgressSpinner() {
  return (
    <div className={styles.progress_spinner}>
      <span />
      <span />
      <span />
      <span />
      <span />
      <span />
      <span />
      <span />
    </div>
  )
}
