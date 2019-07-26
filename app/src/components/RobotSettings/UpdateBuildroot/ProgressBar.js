// @flow
import * as React from 'react'
import styles from './styles.css'

type ProgressBarProps = {
  progress: number | null,
}

export default function ProgressBar(props: ProgressBarProps) {
  const { progress } = props
  const width = progress && `${progress}%`
  return (
    <div className={styles.progress_bar_container}>
      <span className={styles.progress_text}>{progress}%</span>
      <div style={{ width: width }} className={styles.progress_bar} />
    </div>
  )
}
