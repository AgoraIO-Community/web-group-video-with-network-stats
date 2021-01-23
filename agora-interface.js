/*
 * JS Interface with Agora.io SDK
 */

// video profile settings
var cameraVideoProfile = '480p_4'; // 640 × 480 @ 30fps  & 750kbs
var screenVideoProfile = '720p_2'; // 640 × 480 @ 30fps

// create client instances for camera (client) and screen share (screenClient)
var client = AgoraRTC.createClient({mode: 'rtc', codec: 'vp8'}); 
var screenClient = AgoraRTC.createClient({mode: 'rtc', codec: 'vp8'}); 

// stream references (keep track of active streams) 
var remoteStreams = {}; // remote streams obj struct [id : stream] 

var localStreams = {
  camera: {
    id: "",
    stream: {}
  },
  screen: {
    id: "",
    stream: {}
  }
};

var statsIntervals = []; // references to intervals for getting in-call stats

var mainStreamId; // reference to main stream
var screenShareActive = false; // flag for screen share 

function initClientAndJoinChannel(agoraAppId, token, channelName, uid) {
  // init Agora SDK
  client.init(agoraAppId, function () {
    console.log("AgoraRTC client initialized");
    joinChannel(channelName, uid, token); // join channel upon successfull init
  }, function (err) {
    console.log("[ERROR] : AgoraRTC client init failed", err);
  });
}

client.on('stream-published', function (evt) {
  console.log("Publish local stream successfully");
  enableStats();
});

// network
client.on('network-quality', function(stats) {
  setQualityDescriptors(stats.uplinkNetworkQuality, $('#uplink-quality-btn'), $('#uplink-quality-icon'))
  setQualityDescriptors(stats.downlinkNetworkQuality, $('#downlink-quality-btn'), $('#downlink-quality-icon'));
});

// connect remote streams
client.on('stream-added', function (evt) {
  var stream = evt.stream;
  var streamId = stream.getId();
  console.log("new stream added: " + streamId);
  // Check if the stream is local
  if (streamId != localStreams.screen.id) {
    console.log('subscribe to remote stream:' + streamId);
    // Subscribe to the stream.
    client.subscribe(stream, function (err) {
      console.log("[ERROR] : subscribe stream failed", err);
    });
    // Set the fallback option for each remote stream. 
    // - When the network condition is poor, set the client to receive audio only. 
    client.setStreamFallbackOption(stream, 2);
  }
});

client.on('stream-subscribed', function (evt) {
  var remoteStream = evt.stream;
  var remoteId = remoteStream.getId();
  remoteStreams[remoteId] = remoteStream;
  console.log("Subscribe remote stream successfully: " + remoteId);
  if( $('#full-screen-video').is(':empty') ) { 
    mainStreamId = remoteId;
    remoteStream.play('full-screen-video');
    $('#main-stats-btn').show();
    $('#main-stream-stats-btn').show();
  } else if (remoteId == 49024) {
    // move the current main stream to miniview
    remoteStreams[mainStreamId].stop(); // stop the main video stream playback
    client.setRemoteVideoStreamType(remoteStreams[mainStreamId], 1); // subscribe to the low stream
    addRemoteStreamMiniView(remoteStreams[mainStreamId]); // send the main video stream to a container
    // set the screen-share as the main 
    mainStreamId = remoteId;
    remoteStream.play('full-screen-video');s
  } else {
    client.setRemoteVideoStreamType(remoteStream, 1); // subscribe to the low stream
    addRemoteStreamMiniView(remoteStream);
  }
});

// remove the remote-container when a user leaves the channel
client.on("peer-leave", function(evt) {
  var streamId = evt.uid; // the the stream id
  if(remoteStreams[streamId] != undefined) {
    remoteStreams[streamId].stop(); // stop playing the feed
    delete remoteStreams[streamId]; // remove stream from list
    if (streamId == mainStreamId || streamId == 49024) {
      // hide the stats popover
      var mainVideoStatsBtn = $('#main-stats-btn');
      if(mainVideoStatsBtn.data('bs.popover')) {
          mainVideoStatsBtn.popover('hide');
      }
      var mainVideoStatsBtn = $('#main-stream-stats-btn');
      if(mainVideoStatsBtn.data('bs.popover')) {
          mainVideoStatsBtn.popover('hide');
      }
      // swap out the video
      var streamIds = Object.keys(remoteStreams);
      if (streamIds.length > 0) {
        var randomId = streamIds[Math.floor(Math.random()*streamIds.length)]; // select from the remaining streams
        remoteStreams[randomId].stop(); // stop the stream's existing playback
        var remoteContainerID = '#' + randomId + '_container';
        $(remoteContainerID).empty().remove(); // remove the stream's miniView container
        remoteStreams[randomId].play('full-screen-video'); // play the random stream as the main stream
        mainStreamId = randomId; // set the new main remote stream 
      } else {
        $('#main-stats-btn').hide();
        $('#main-stream-stats-btn').hide();
      }
    } else {
      // close the pop-over
      var remoteVideoStatsBtn = $('#'+ streamId +'-stats-btn');
      if(remoteVideoStatsBtn.data('bs.popover')) {
          remoteVideoStatsBtn.popover('hide');
      }
      var remoteContainerID = '#' + streamId + '_container';
      $(remoteContainerID).empty().remove(); // 
    }
  }
});

// show mute icon whenever a remote has muted their mic
client.on("mute-audio", function (evt) {
  toggleVisibility('#' + evt.uid + '_mute', true);
});

client.on("unmute-audio", function (evt) {
  toggleVisibility('#' + evt.uid + '_mute', false);
});

// show user icon whenever a remote has disabled their video
client.on("mute-video", function (evt) {
  var remoteId = evt.uid;
  // if the main user stops their video select a random user from the list
  if (remoteId != mainStreamId) {
    // if not the main vidiel then show the user icon
    toggleVisibility('#' + remoteId + '_no-video', true);
  }
});

client.on("unmute-video", function (evt) {
  toggleVisibility('#' + evt.uid + '_no-video', false);
});

// Stream Fallback listeners
client.on("stream-fallback", function (evt) {
  console.log(evt);
});

client.on("stream-type-changed", function (evt) {
  console.log(evt);
});

// join a channel
function joinChannel(channelName, uid, token) {
  client.join(token, channelName, uid, function(uid) {
      console.log("User " + uid + " join channel successfully");
      createCameraStream(uid);
      localStreams.camera.id = uid; // keep track of the stream uid 
  }, function(err) {
      console.log("[ERROR] : join channel failed", err);
  });
}

// video streams for channel
function createCameraStream(uid) {
  var localStream = AgoraRTC.createStream({
    streamID: uid,
    audio: true,
    video: true,
    screen: false
  });
  localStream.setVideoProfile(cameraVideoProfile);
  localStream.init(function() {
    console.log("getUserMedia successfully");
    // TODO: add check for other streams. play local stream full size if alone in channel
    localStream.play('local-video'); // play the given stream within the local-video div

    // Enable dual-stream mode for the sender.
    client.enableDualStream(function () {
      console.log("Enable dual stream success!");
    }, function (err) {
      console.log(err);
    });

    // set the lowstream profile settings
    // var lowVideoStreamProfile = {
    //   bitrate: 200,
    //   framerate: 15,
    //   height: 240,
    //   width: 320
    // }
    // client.setLowStreamParameter(lowVideoStreamProfile);

    // publish local stream
    client.publish(localStream, function (err) {
      console.log("[ERROR] : publish local stream error: " + err);
    });
  
    enableUiControls(localStream); // move after testing
    localStreams.camera.stream = localStream; // keep track of the camera stream for later
  }, function (err) {
    console.log("[ERROR] : getUserMedia failed", err);
  });
}

// SCREEN SHARING
function initScreenShare(agoraAppId, channelName) {
  screenClient = AgoraRTC.createClient({mode: 'rtc', codec: 'vp8'}); 
  console.log("AgoraRTC screenClient initialized");
  var uid = 49024;
  screenClient = AgoraRTC.createClient({mode: 'rtc', codec: 'vp8'}); 
  screenClient.init(agoraAppId, function () {
    console.log("AgoraRTC screenClient initialized");
  }, function (err) {
    console.log("[ERROR] : AgoraRTC screenClient init failed", err);
  });
  // keep track of the uid of the screen stream. 
  localStreams.screen.id = uid;  
  
  // Create the stream for screen sharing.
  var screenStream = AgoraRTC.createStream({
    streamID: uid,
    audio: false, // Set the audio attribute as false to avoid any echo during the call.
    video: false,
    screen: true, // screen stream
    screenAudio: true,
    mediaSource:  'screen', // Firefox: 'screen', 'application', 'window' (select one)
  });
  // initialize the stream 
  // -- NOTE: this must happen directly from user interaction, if called by a promise or callback it will fail.
  screenStream.init(function(){
    console.log("getScreen successful");
    localStreams.screen.stream = screenStream; // keep track of the screen stream
    screenShareActive = true;
    $("#screen-share-btn").prop("disabled",false); // enable button
    screenClient.join(token, channelName, uid, function(uid) { 
      screenClient.publish(screenStream, function (err) {
        console.log("[ERROR] : publish screen stream error: " + err);
      });
    }, function(err) {
      console.log("[ERROR] : join channel as screen-share failed", err);
    });
  }, function (err) {
    console.log("[ERROR] : getScreen failed", err);
    localStreams.screen.id = ""; // reset screen stream id
    localStreams.screen.stream = {}; // reset the screen stream
    screenShareActive = false; // resest screenShare
    toggleScreenShareBtn(); // toggle the button icon back
    $("#screen-share-btn").prop("disabled",false); // enable button
  });
  var token = generateToken();
  screenClient.on('stream-published', function (evt) {
    console.log("Publish screen stream successfully");
    
    if( $('#full-screen-video').is(':empty') ) { 
      $('#main-stats-btn').show();
      $('#main-stream-stats-btn').show();
    } else {
      // move the current main stream to miniview
      remoteStreams[mainStreamId].stop(); // stop the main video stream playback
      client.setRemoteVideoStreamType(remoteStreams[mainStreamId], 1); // subscribe to the low stream
      addRemoteStreamMiniView(remoteStreams[mainStreamId]); // send the main video stream to a container
    }

    mainStreamId = localStreams.screen.id;
    localStreams.screen.stream.play('full-screen-video');

    // remoteStreams[mainStreamId].stop(); // stop the main video stream playback
    // addRemoteStreamMiniView(remoteStreams[mainStreamId]); // send the main video stream to a container
    // localStreams.screen.stream.play('full-screen-video'); // play the screen share as full-screen-video (vortext effect?)
    // $("#video-btn").prop("disabled",true); // disable the video button (as cameara video stream is disabled)
  });
  
  screenClient.on('stopScreenSharing', function (evt) {
    console.log("screen sharing stopped", err);
  }); 
}

function stopScreenShare() {
  localStreams.screen.stream.disableVideo(); // disable the local video stream (will send a mute signal)
  localStreams.screen.stream.stop(); // stop playing the local stream
  localStreams.camera.stream.enableVideo(); // enable the camera feed
  localStreams.camera.stream.play('local-video'); // play the camera within the full-screen-video div
  $("#video-btn").prop("disabled",false);
  screenClient.leave(function() {
    screenShareActive = false; 
    console.log("screen client leaves channel");
    $("#screen-share-btn").prop("disabled",false); // enable button
    screenClient.unpublish(localStreams.screen.stream); // unpublish the screen client
    localStreams.screen.stream.close(); // close the screen client stream
    localStreams.screen.id = ""; // reset the screen id
    localStreams.screen.stream = {}; // reset the stream obj
  }, function(err) {
    console.log("client leave failed ", err); //error handling
  }); 
}

// REMOTE STREAMS UI
function addRemoteStreamMiniView(remoteStream){
  var streamId = remoteStream.getId();
  // append the remote stream template to #remote-streams
  $('#remote-streams').append(
    $('<div/>', { 'id': streamId + '_container', 'class': 'remote-stream-container col' }).append(
      $('<div/>', {'id': streamId + '_mute', 'class': 'mute-overlay'}).append(
          $('<i/>', {'class': 'fas fa-microphone-slash'})
      ),
      $('<div/>', { 'id': streamId + '_no-video', 'class': 'no-video-overlay text-center',}).append(
          $('<i/>', {'class': 'fas fa-user'})
        ),
      $('<div/>', { 'id': streamId + '-stats-container', 'class': 'remote-stats-container col-2 float-right text-right p-0 m-0',}).append(
          $('<button/>', {
                          'id': streamId +'-stream-stats-btn', 
                          'type': 'button', 
                          'class': 'btn btn-lg p-0 m-1',
                          'data-toggle': 'popover',
                          'data-placement': 'top',
                          'data-html': true,
                          'title': 'Stream Stats',
                          'data-content': 'loading stats...'
            }).append(
              $('<i/>', {'id': streamId +'-stream-stats-icon', 'class': 'fas fa-signal', 'style':'color:#fff'})
          ),
          $('<button/>', {
                          'id': streamId +'-stats-btn', 
                          'type': 'button', 
                          'class': 'btn btn-lg  p-0 m-1',
                          'data-toggle': 'popover',
                          'data-placement': 'top',
                          'data-html': true,
                          'title': 'Video Stats',
                          'data-content': 'loading stats...'
            }).append(
              $('<i/>', {'class': 'fas fa-info-circle', 'style':'color:#fff'})
          )
        ),
      $('<div/>', {'id': 'agora_remote_' + streamId, 'class': 'remote-video'})
    )
  );
  remoteStream.play('agora_remote_' + streamId); 

  var containerId = '#' + streamId + '_container';
  $(containerId).dblclick(function() {
    // play selected container as full screen - swap out current full screen stream
    remoteStreams[mainStreamId].stop(); // stop the main video stream playback
    client.setRemoteVideoStreamType(remoteStreams[mainStreamId], 1); // subscribe to the low stream
    addRemoteStreamMiniView(remoteStreams[mainStreamId]); // send the main video stream to a container
    $(containerId).empty().remove(); // remove the stream's miniView container
    remoteStreams[streamId].stop() // stop the container's video stream playback
    client.setRemoteVideoStreamType(remoteStreams[streamId], 0); // subscribe to the high stream
    remoteStreams[streamId].play('full-screen-video'); // play the remote stream as the full screen video
    mainStreamId = streamId; // set the container stream id as the new main stream id
  });
}

function leaveChannel() {
  
  if(screenShareActive) {
    stopScreenShare();
  }

  // disable stats interval
  disableStats();
  // hide all pop-overs
  hideStatsPopovers()


  client.leave(function() {
    console.log("client leaves channel");
    localStreams.camera.stream.stop() // stop the camera stream playback
    client.unpublish(localStreams.camera.stream); // unpublish the camera stream
    localStreams.camera.stream.close(); // clean up and close the camera stream
    $("#remote-streams").empty() // clean up the remote feeds
    //disable the UI elements
    $("#mic-btn").prop("disabled", true);
    $("#video-btn").prop("disabled", true);
    $("#screen-share-btn").prop("disabled", true);
    $("#exit-btn").prop("disabled", true);
    // hide the mute/no-video overlays
    toggleVisibility("#mute-overlay", false); 
    toggleVisibility("#no-local-video", false);
    // show the modal overlay to join
    $("#modalForm").modal("show"); 
  }, function(err) {
    console.log("client leave failed ", err); //error handling
  });
}

// use tokens for added security
function generateToken() {
  return null; // TODO: add a token generation
}

// stats
function hideStatsPopovers() {
  // add the static pop-over btns first
  var statsBtns = [
    $('#main-stats-btn'), 
    $('#main-stream-stats-btn'),
    $('#stream-stats-btn'), 
    $('#network-stats-btn'),
    $('#session-stats-btn'),
    $('#audio-stats-btn'),
    $('#video-stats-btn')
  ]

  // loop through remote streams and add dynamic popover btns
  var streamIds = Object.keys(remoteStreams);
  if (streamIds.length > 0) {
    streamIds.forEach(function (streamId) {
      var remoteStatbtn = $('#' + streamId +'-stats-btn')
      if(remoteStatbtn)[
        statsBtns.push(remoteStatbtn)
      ]
    })
  }

  // hide all pop-overs
  statsBtns.forEach(function(statBtn){
    if(statBtn.data('bs.popover')) {
      statBtn.popover('hide');
    }
  })
}

function enableStats() {

  // local stream stats
  var localStreamStatsBtn = $('#stream-stats-btn');
  var localStreamStatsInterval = setInterval(() => {
    localStreams.camera.stream.getStats((stats) => {
      var networkQuality;
      var networkIcon = $('#connection-quality-icon');
      if (stats.accessDelay < 100){
        networkQuality = "Good"
        networkIcon.css( "color", "green" );
      } else if (stats.accessDelay < 200){
        networkQuality = "Poor"
        networkIcon.css( "color", "orange" );
      } else if (stats.accessDelay >= 200){
        networkQuality = "Bad"
        networkIcon.css( "color", "red" );
      } else {
        networkQuality = "-"
        networkIcon.css( "color", "black" );
      }
      if(localStreamStatsBtn.data('bs.popover') && localStreamStatsBtn.attr('aria-describedby')) {
        var localStreamStats = `<strong>Access Delay:</strong> ${stats.accessDelay}<br/>
                                <strong>Network Quality:</strong> ${networkQuality}<br/> 
                                <strong>Audio Send Bytes:</strong> ${stats.audioSendBytes}<br/>
                                <strong>Audio Send Packets:</strong> ${stats.audioSendPackets}<br/>
                                <strong>Audio Send Packets Lost:</strong> ${stats.audioSendPacketsLost}<br/>
                                <strong>Video Send Bytes:</strong> ${stats.videoSendBytes}<br/>
                                <strong>Video Send Frame Rate:</strong> ${stats.videoSendFrameRate} fps<br/>
                                <strong>Video Send Packets:</strong> ${stats.videoSendPackets}<br/>
                                <strong>Video Send Packets Lost:</strong> ${stats.videoSendPacketsLost}<br/>
                                <strong>Video Send Resolution Heigh:</strong> ${stats.videoSendResolutionHeight}px<br/>  
                                <strong>Video Send Resolution Width:</strong> ${stats.videoSendResolutionWidth}px
                              `;
      localStreamStatsBtn.data('bs.popover').element.dataset.content = localStreamStats;
      localStreamStatsBtn.data('bs.popover').setContent();
      localStreamStatsBtn.popover('update');
      }

    });
  }, 1000);                        
  statsIntervals.localStreamStatsInterval = localStreamStatsInterval;

  // network
  var networkStatsBtn = $('#network-stats-btn');
  var networkInterval = setInterval(() => {
    if(networkStatsBtn.data('bs.popover') && networkStatsBtn.attr('aria-describedby')) {
      client.getTransportStats((stats) => {
        var networkStats = `<strong>Round-Trip Time:</strong> ${stats.RTT}<br/>
                            <strong>Network Type:</strong> ${stats.networkType}<br/>
                            <strong>Outgoing Available Bandwidth:</strong> ${stats.OutgoingAvailableBandwidth}
                          `;
        networkStatsBtn.data('bs.popover').element.dataset.content = networkStats;
        networkStatsBtn.data('bs.popover').setContent();
        networkStatsBtn.popover('update');
      });
    }
  }, 1000);                        
  statsIntervals.network = networkInterval;

  // session
  var sessionStatsBtn = $('#session-stats-btn');
  var sessionInterval = setInterval(() => {
    if(sessionStatsBtn.data('bs.popover') && sessionStatsBtn.attr('aria-describedby')) {
      client.getSessionStats((stats) => {
          var sessionStats = `<strong>Duration:</strong> ${stats.Duration}s<br/>
                              <strong>User Count:</strong> ${stats.UserCount}<br/>
                              <strong>Sent Bytes:</strong> ${stats.SendBytes}<br/>
                              <strong>Recv Bytes:</strong> ${stats.RecvBytes}<br/>
                              <strong>Send Bitrate:</strong> ${stats.SendBitrate} Kbps<br/>
                              <strong>Recv Bitrate:</strong> ${stats.RecvBitrate} Kbps
                            `;
          sessionStatsBtn.data('bs.popover').element.dataset.content = sessionStats;
          sessionStatsBtn.data('bs.popover').setContent();
          sessionStatsBtn.popover('update');
      });
    }
  }, 1000);
  statsIntervals.session = sessionInterval;

  // local audio
  var localAudioStatsBtn = $('#audio-stats-btn');
  var localAudioInterval = setInterval(() => {
    localAudioStatsBtn.show();
    if(localAudioStatsBtn.data('bs.popover') && localAudioStatsBtn.attr('aria-describedby')) {
      client.getLocalAudioStats((localAudioStats) => {
        for(var uid in localAudioStats){
          if(uid == localStreams.camera.id) {
            var audioStats = `<strong>Codec Type:</strong> ${localAudioStats[uid].CodecType}<br/>
                              <strong>Mute State:</strong> ${localAudioStats[uid].MuteState}<br/>
                              <strong>Recording Level:</strong> ${localAudioStats[uid].RecordingLevel}<br/>
                              <strong>Sampling Rate:</strong> ${localAudioStats[uid].SamplingRate} kHz<br/>
                              <strong>Send Bitrate:</strong> ${localAudioStats[uid].SendBitrate} Kbps<br/>
                              <strong>SendLevel:</strong> ${localAudioStats[uid].SendLevel} 
                            `;
            localAudioStatsBtn.data('bs.popover').element.dataset.content = audioStats;
            localAudioStatsBtn.data('bs.popover').setContent();
            localAudioStatsBtn.popover('update');
          }
        }
      });
    }
  }, 1000);
  statsIntervals.localAudio = localAudioInterval;

  // local video
  var localVideoStatsBtn = $('#video-stats-btn');
  var localVideoInterval = setInterval(() => {
    localVideoStatsBtn.show();
    if(localVideoStatsBtn.data('bs.popover')&& localVideoStatsBtn.attr('aria-describedby')) {
      client.getLocalVideoStats((localVideoStats) => {
        for(var uid in localVideoStats){
          if(uid == localStreams.camera.id) {
            var videoStats = `<strong>Capture Frame Rate:</strong> ${localVideoStats[uid].CaptureFrameRate} fps<br/>
                              <strong>Capture Resolution Height:</strong> ${localVideoStats[uid].CaptureResolutionHeight}px<br/>
                              <strong>Capture Resolution Width:</strong> ${localVideoStats[uid].CaptureResolutionWidth}px<br/>
                              <strong>Encode Delay:</strong> ${localVideoStats[uid].EncodeDelay}ms<br/>
                              <strong>Mute State:</strong> ${localVideoStats[uid].MuteState}<br/>
                              <strong>Send Bitrate:</strong> ${localVideoStats[uid].SendBitrate} Kbps<br/>
                              <strong>Send Frame Rate:</strong> ${localVideoStats[uid].SendFrameRate} fps<br/>
                              <strong>Send Resolution Heigh:</strong> ${localVideoStats[uid].SendResolutionHeight}px<br/>  
                              <strong>Send Resolution Width:</strong> ${localVideoStats[uid].SendResolutionWidth}px<br/>
                              <strong>Target Send Bitrate:</strong> ${localVideoStats[uid].TargetSendBitrate} Kbps<br/>
                              <strong>Total Duration:</strong> ${localVideoStats[uid].TotalDuration}s<br/>
                              <strong>Total Freeze Time:</strong> ${localVideoStats[uid].TotalFreezeTime}s 
                            `;
            localVideoStatsBtn.data('bs.popover').element.dataset.content = videoStats;
            localVideoStatsBtn.data('bs.popover').setContent();
            localVideoStatsBtn.popover('update');
          }
        }
      });
    }

  }, 1000);
  statsIntervals.localVideo = localVideoInterval;

  // remote audio
  var remoteAudioInterval = setInterval(() => {
    client.getRemoteVideoStats((remoteAudioStatsMap) => {
      for(var uid in remoteAudioStatsMap){
        var remoteAudioStatsBtn;
        if(uid == mainStreamId){
          remoteAudioStatsBtn = $('#main-audio-stats-btn');
        } else {
          remoteAudioStatsBtn = $('#'+ uid +'-stats-btn');
        }
        if(remoteAudioStatsBtn.data('bs.popover')&& remoteAudioStatsBtn.attr('aria-describedby')) {
          var videoStats = `<strong>CodecType:</strong> ${remoteAudioStatsMap[uid].CodecType}<br/>
                            <strong>End 2 End Delay:</strong> ${remoteAudioStatsMap[uid].End2EndDelay}ms<br/>
                            <strong>Mute State:</strong> ${remoteAudioStatsMap[uid].MuteState}<br/>
                            <strong>Packet Loss Rate:</strong> ${remoteAudioStatsMap[uid].PacketLossRate}%<br/>
                            <strong>Recv Bitrate:</strong> ${remoteAudioStatsMap[uid].RecvBitrate} Kbps<br/>
                            <strong>Recv Level:</strong> ${remoteAudioStatsMap[uid].RecvLevel}px<br/>
                            <strong>Total Freeze Time:</strong> ${remoteAudioStatsMap[uid].TotalFreezeTime}s<br/>
                            <strong>Total Play Duration:</strong> ${remoteAudioStatsMap[uid].TotalPlayDuration}s<br/>
                            <strong>Transport Delay:</strong> ${remoteAudioStatsMap[uid].TransportDelay}ms
                            `;
            remoteAudioStatsBtn.data('bs.popover').element.dataset.content = videoStats;
            remoteAudioStatsBtn.data('bs.popover').setContent();
            remoteAudioStatsBtn.popover('update');
        }
      }
    });
  }, 1000);
  statsIntervals.remoteAudio = remoteAudioInterval;

  // remote video
  var remoteVideoInterval = setInterval(() => {
    client.getRemoteVideoStats((remoteVideoStatsMap) => {
      for(var uid in remoteVideoStatsMap){
        var remoteVideoStatsBtn;
        if(uid == mainStreamId){
          remoteVideoStatsBtn = $('#main-video-stats-btn');
        } else {
          remoteVideoStatsBtn = $('#'+ uid +'-stats-btn');
        }
        if(remoteVideoStatsBtn.data('bs.popover')&& remoteVideoStatsBtn.attr('aria-describedby')) {
          var videoStats = `<strong>End 2 End Delay:</strong> ${remoteVideoStatsMap[uid].End2EndDelay}ms<br/>
                            <strong>Mute State:</strong> ${remoteVideoStatsMap[uid].MuteState}<br/>
                            <strong>Packet Loss Rate:</strong> ${remoteVideoStatsMap[uid].PacketLossRate}%<br/>
                            <strong>Recv Bitrate:</strong> ${remoteVideoStatsMap[uid].RecvBitrate} Kbps<br/>
                            <strong>Recv Resolution Height:</strong> ${remoteVideoStatsMap[uid].RecvResolutionHeight}px<br/>
                            <strong>Recv Resolution Width:</strong> ${remoteVideoStatsMap[uid].RecvResolutionWidth}px<br/>
                            <strong>Render Frame Rate:</strong> ${remoteVideoStatsMap[uid].RenderFrameRate} fps<br/>
                            <strong>Render Resolution Heigh:</strong> ${remoteVideoStatsMap[uid].RenderResolutionHeight}px<br/>  
                            <strong>Render Resolution Width:</strong> ${remoteVideoStatsMap[uid].RenderResolutionWidth}px<br/>
                            <strong>Total Freeze Time:</strong> ${remoteVideoStatsMap[uid].TotalFreezeTime}s<br/>
                            <strong>Total Play Duration:</strong> ${remoteVideoStatsMap[uid].TotalPlayDuration}s<br/>
                            <strong>Transport Delay:</strong> ${remoteVideoStatsMap[uid].TransportDelay}ms
                            `;
            remoteVideoStatsBtn.data('bs.popover').element.dataset.content = videoStats;
            remoteVideoStatsBtn.data('bs.popover').setContent();
            remoteVideoStatsBtn.popover('update');
        }
      }
    });
  }, 1000);
  statsIntervals.remoteVideo = remoteVideoInterval;
  
  // remote stream 
  var remoteStreamInterval = setInterval(() => {
    for(var uid in remoteStreams){
      var remoteStreamStatsBtn;
      var remoteNetworkIcon;
      if(uid == mainStreamId){
        remoteStreamStatsBtn = $('#main-stream-stats-btn');
        remoteNetworkIcon = $('#main-stream-stats-icon'); 
      } else {
        remoteStreamStatsBtn = $('#'+ uid + '-stream-stats-btn');
        remoteNetworkIcon = $('#'+ uid + '-stream-stats-icon'); 
      }
      // console.log('get stats for uid: ' + uid);
      remoteStreams[uid].getStats(function (stats) {
        // console.log('-- stats for uid: ' + uid);
        // console.log(stats);
        var networkQuality;
        // update network icon color
        if (stats.accessDelay < 100){
          networkQuality = "Good"
          remoteNetworkIcon.css( "color", "green" );
        } else if (stats.accessDelay < 200){
          networkQuality = "Poor"
          remoteNetworkIcon.css( "color", "orange" );
        } else if (stats.accessDelay >= 200){
          networkQuality = "Bad"
          remoteNetworkIcon.css( "color", "red" );
        } else {
          networkQuality = "-"
          remoteNetworkIcon.css( "color", "white" );
        }

        // update tool-tip
        if(remoteStreamStatsBtn.data('bs.popover')&& remoteStreamStatsBtn.attr('aria-describedby')) {
          var remoteStreamStats = `<strong>Access Delay:</strong> ${stats.accessDelay}<br/>
                                  <strong>Network Quality:</strong> ${networkQuality}<br/> 
                                  <strong>Audio Receive Bytes:</strong> ${stats.audioReceiveBytes}<br/>
                                  <strong>Audio Receive Delay:</strong> ${stats.audioReceiveDelay}<br/>
                                  <strong>Audio Receive Packets:</strong> ${stats.audioReceivePackets}<br/>
                                  <strong>Audio Receive Packets Lost:</strong> ${stats.audioReceivePacketsLost}<br/>
                                  <strong>End To End Delay:</strong> ${stats.endToEndDelay}<br/>
                                  <strong>Video Receive Bytes:</strong> ${stats.videoReceiveBytes}<br/>
                                  <strong>Video Decode Frame Rate:</strong> ${stats.videoReceiveDecodeFrameRate} fps<br/>
                                  <strong>Video Receive Delay:</strong> ${stats.videoReceiveDelay}<br/>
                                  <strong>Video Receive Frame Rate:</strong> ${stats.videoReceiveFrameRate} fps<br/>
                                  <strong>Video Receive Packets:</strong> ${stats.videoReceivePackets}<br/>
                                  <strong>Video Receive Packets Lost:</strong> ${stats.videoReceivePacketsLost}<br/>
                                  <strong>Video Receive Resolution Heigh:</strong> ${stats.videoReceiveResolutionHeight}px<br/>  
                                  <strong>Video Receive Resolution Width:</strong> ${stats.videoReceiveResolutionWidth}px
                                `;
          remoteStreamStatsBtn.data('bs.popover').element.dataset.content = remoteStreamStats;
          remoteStreamStatsBtn.data('bs.popover').setContent();
          remoteStreamStatsBtn.popover('update');
        }
      });
      
    }
  }, 1000);
  statsIntervals.remoteStreamInterval = remoteStreamInterval;
}

function disableStats() {
  for(var interval in statsIntervals) {
    try {
      clearInterval(statsIntervals[interval]);
    } catch (error) {
      console(`error stoping interval: ${interval}`);
      console(error);
    }
  }
}

// quality discriptor 
function setQualityDescriptors(quality, btn, icon) {
  // "0": The network quality is unknown.
  // "1": The network quality is excellent.
  // "2": The network quality is quite good, but the bitrate may be slightly lower than excellent.
  // "3": Users can feel the communication slightly impaired.
  // "4": Users can communicate only not very smoothly.
  // "5": The network is so bad that users can hardly communicate.
  // "6": The network is down and users cannot communicate at all.
  var description;
  var color;
  switch (quality) {
    case 0:
      description = "Unknown"
      color = "#708090"; // slate grey
      break;
    case 1:
      description = "Excellent"
      color = "#3CB371"; // medium sea green
      break;
    case 2:
      description = "Good"
      color = "#90EE90"; // light-green
      break;
    case 3:
      description = "OK"
      color = "#9ACD32"; // yellow-green
      break;
    case 4:
      description = "Not Good"
      color = "#FFFF00"; // yellow
      break;
    case 5:
      description = "Poor"
      color = "#FF8C00"; // dark orange
      break;
    case 6:
      description = "Bad"
      color = "#FF0000"; // red
        break;
    default:
      console.log('Uplink Quality Error - unknown value: ' + stats.uplinkNetworkQuality);
      description = "-";
      color = 'black';
      break;
  }

  if (btn.attr('aria-describedby')) {
    btn.data('bs.popover').element.dataset.content = description;
    btn.data('bs.popover').setContent();
    btn.popover('update');
  }

  icon.css( "color", color); 
}