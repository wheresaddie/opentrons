// @flow
import * as React from 'react'
import { ScrollableAlertModal } from '../../modals'
import ReleaseNotes from '../../ReleaseNotes'
import styles from './styles.css'
import type { ButtonProps } from '@opentrons/components'
import type { BuildrootStatus } from '../../../discovery'

type Props = {
  notNowButton: ButtonProps,
  releaseNotes: ?string,
  buildrootStatus: BuildrootStatus | null,
  proceed: () => mixed,
}

export default function ReleaseNotesModal(props: Props) {
  const { notNowButton, releaseNotes, buildrootStatus, proceed } = props
  const heading =
    buildrootStatus === 'buildroot' ? 'Robot Update' : 'Robot System Update'
  const buttons = [
    notNowButton,
    {
      children: 'update robot',
      className: styles.view_update_button,
      onClick: proceed,
    },
  ]
  return (
    <ScrollableAlertModal heading={heading} buttons={buttons} alertOverlay>
      <ReleaseNotes source={releaseNotes} />
    </ScrollableAlertModal>
  )
}
