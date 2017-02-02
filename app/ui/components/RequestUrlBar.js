import React, {Component, PropTypes} from 'react';
import {remote} from 'electron';
import {DEBOUNCE_MILLIS, isMac} from '../../common/constants';
import {Dropdown, DropdownButton, DropdownItem, DropdownDivider, DropdownHint} from './base/dropdown';
import {trackEvent} from '../../analytics';
import MethodDropdown from './dropdowns/MethodDropdown';
import PromptModal from './modals/PromptModal';
import {showModal} from './modals/index';
import PromptButton from './base/PromptButton';


class RequestUrlBar extends Component {
  state = {
    currentInterval: null,
    currentTimeout: null,
    downloadPath: null
  };

  _urlChangeDebounceTimeout = null;

  _handleFormSubmit = e => {
    e.preventDefault();
    e.stopPropagation();

    this._handleSend();
  };

  _handleMethodChange = method => {
    this.props.onMethodChange(method);
    trackEvent('Request', 'Method Change', method);
  };

  _handleUrlChange = e => {
    const url = e.target.value;

    clearTimeout(this._urlChangeDebounceTimeout);
    this._urlChangeDebounceTimeout = setTimeout(() => {
      this.props.onUrlChange(url);
    }, DEBOUNCE_MILLIS);
  };

  _handleUrlPaste = e => {
    /*
     * Note that this is in a timeout because we want it to happen after the onChange
     * callback. If it happens before, then the change will overwrite anything that we do.
     *
     * Also, note that there is still a potential race condition here if, for some reason,
     * the onChange callback is not called before DEBOUNCE_MILLIS is over. This is extremely
     * unlikely since it should happen in the same tick.
     */
    const text = e.clipboardData.getData('text/plain');
    setTimeout(() => {
      this.props.onUrlPaste(text);
    }, DEBOUNCE_MILLIS * 2);
  };

  _handleGenerateCode = () => {
    this.props.handleGenerateCode();
    trackEvent('Request', 'Generate Code', 'Send Action');
  };

  _handleSetDownloadLocation = () => {
    const options = {
      title: 'Select Download Location',
      buttonLabel: 'Select',
      properties: ['openDirectory'],
    };

    remote.dialog.showOpenDialog(options, paths => {
      if (!paths || paths.length === 0) {
        trackEvent('Response', 'Download Select Cancel');
        return;
      }

      this.setState({downloadPath: paths[0]});
    });
  };

  _handleClearDownloadLocation = () => {
    this.setState({downloadPath: null});
  };

  _handleKeyDown = e => {
    if (!this._input) {
      return;
    }

    // meta+l
    const metaPressed = isMac() ? e.metaKey : e.ctrlKey;
    if (metaPressed && e.keyCode === 76) {
      e.preventDefault();
      this._input.focus();
      this._input.select();
    }
  };

  _handleSend = () => {
    // Don't stop interval because duh, it needs to keep going!
    // XXX this._handleStopInterval(); XXX

    this._handleStopTimeout();

    const {downloadPath} = this.state;
    if (downloadPath) {
      this.props.handleSendAndDownload(downloadPath);
    } else {
      this.props.handleSend();
    }
  };

  _handleSendAfterDelay = async () => {
    const seconds = await showModal(PromptModal, {
      inputType: 'decimal',
      headerName: 'Send After Delay',
      label: 'Delay in seconds',
      defaultValue: 3,
      submitName: 'Start',
    });

    this._handleStopTimeout();
    this._sendTimeout = setTimeout(this._handleSend, seconds * 1000);
    this.setState({currentTimeout: seconds});

    trackEvent('Request', 'Send on Delay', 'Send Action', seconds);
  };

  _handleSendOnInterval = async () => {
    const seconds = await showModal(PromptModal, {
      inputType: 'decimal',
      headerName: 'Send on Interval',
      label: 'Interval in seconds',
      defaultValue: 3,
      submitName: 'Start',
    });

    this._handleStopInterval();
    this._sendInterval = setInterval(this._handleSend, seconds * 1000);
    this.setState({currentInterval: seconds});

    trackEvent('Request', 'Send on Interval', 'Send Action', seconds);
  };

  _handleStopInterval = () => {
    clearTimeout(this._sendInterval);
    if (this.state.currentInterval) {
      this.setState({currentInterval: null});
      trackEvent('Request', 'Stop Send Interval');
    }
  };

  _handleStopTimeout = () => {
    clearTimeout(this._sendTimeout);
    if (this.state.currentTimeout) {
      this.setState({currentTimeout: null});
    }
    trackEvent('Request', 'Stop Send Timeout');
  };

  _handleClickSend = e => {
    const metaPressed = isMac() ? e.metaKey : e.ctrlKey;

    // If we're pressing a meta key, let the dropdown open
    if (metaPressed) {
      e.preventDefault(); // Don't submit the form
      return;
    }

    // If we're not pressing a meta key, cancel dropdown and send the request
    e.stopPropagation(); // Don't trigger the dropdown
    this._handleFormSubmit(e);
  };

  componentDidMount () {
    document.body.addEventListener('keydown', this._handleKeyDown);
  }

  componentWillUnmount () {
    document.body.removeEventListener('keydown', this._handleKeyDown);
  }

  renderSendButton () {
    const {currentInterval, currentTimeout, downloadPath} = this.state;

    let cancelButton = null;
    if (currentInterval) {
      cancelButton = (
        <button type="button"
                key="cancel-interval"
                className="urlbar__send-btn danger"
                onClick={this._handleStopInterval}>
          Stop
        </button>
      )
    } else if (currentTimeout) {
      cancelButton = (
        <button type="button"
                key="cancel-timeout"
                className="urlbar__send-btn danger"
                onClick={this._handleStopTimeout}>
          Cancel
        </button>
      )
    }

    let sendButton;
    if (!cancelButton) {
      sendButton = (
        <Dropdown key="dropdown" className="tall" right={true}>
          <DropdownButton className="urlbar__send-btn"
                          onClick={this._handleClickSend}
                          type="submit">
            {downloadPath ? "Download" : "Send"}
          </DropdownButton>
          <DropdownDivider>Basic</DropdownDivider>
          <DropdownItem type="submit">
            <i className="fa fa-arrow-circle-o-right"/> Send Now
            <DropdownHint char="Enter"/>
          </DropdownItem>
          <DropdownItem onClick={this._handleGenerateCode}>
            <i className="fa fa-code"/> Generate Client Code
          </DropdownItem>
          <DropdownDivider>Advanced</DropdownDivider>
          <DropdownItem onClick={this._handleSendAfterDelay}>
            <i className="fa fa-clock-o"/> Send After Delay
          </DropdownItem>
          <DropdownItem onClick={this._handleSendOnInterval}>
            <i className="fa fa-repeat"/> Repeat on Interval
          </DropdownItem>
          {downloadPath ? (
              <DropdownItem stayOpenAfterClick={true}
                            buttonClass={PromptButton}
                            addIcon={true}
                            onClick={this._handleClearDownloadLocation}>
                <i className="fa fa-stop-circle"/> Stop Auto-Download
              </DropdownItem>
            ) : (
              <DropdownItem onClick={this._handleSetDownloadLocation}>
                <i className="fa fa-download"/> Download After Send
              </DropdownItem>
            )}
        </Dropdown>
      )
    }

    return [
      cancelButton,
      sendButton,
    ]
  }

  render () {
    const {url, method} = this.props;
    return (
      <div className="urlbar">
        <MethodDropdown onChange={this._handleMethodChange} method={method}>
          {method} <i className="fa fa-caret-down"/>
        </MethodDropdown>
        <form onSubmit={this._handleFormSubmit}>
          <input
            ref={n => this._input = n}
            onPaste={this._handleUrlPaste}
            type="text"
            placeholder="https://api.myproduct.com/v1/users"
            defaultValue={url}
            onChange={this._handleUrlChange}/>
          {this.renderSendButton()}
        </form>
      </div>
    );
  }
}

RequestUrlBar.propTypes = {
  handleSend: PropTypes.func.isRequired,
  handleSendAndDownload: PropTypes.func.isRequired,
  onUrlChange: PropTypes.func.isRequired,
  onUrlPaste: PropTypes.func.isRequired,
  onMethodChange: PropTypes.func.isRequired,
  handleGenerateCode: PropTypes.func.isRequired,
  url: PropTypes.string.isRequired,
  method: PropTypes.string.isRequired
};

export default RequestUrlBar;
