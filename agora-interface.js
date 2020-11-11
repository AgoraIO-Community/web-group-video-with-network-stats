/*
 * JS Interface for Agora.io SDK
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
  } else {
    addRemoteStreamMiniView(remoteStream);
  }
});

// remove the remote-container when a user leaves the channel
client.on("peer-leave", function(evt) {
  var streamId = evt.stream.getId(); // the the stream id
  if(remoteStreams[streamId] != undefined) {
    remoteStreams[streamId].stop(); // stop playing the feed
    delete remoteStreams[streamId]; // remove stream from list
    if (streamId == mainStreamId) {
      var streamIds = Object.keys(remoteStreams);
      if (streamIds.length > 1) {
        var randomId = streamIds[Math.floor(Math.random()*streamIds.length)]; // select from the remaining streams
        remoteStreams[randomId].stop(); // stop the stream's existing playback
        var remoteContainerID = '#' + randomId + '_container';
        $(remoteContainerID).empty().remove(); // remove the stream's miniView container
        remoteStreams[randomId].play('full-screen-video'); // play the random stream as the main stream
        mainStreamId = randomId; // set the new main remote stream
      } else {
        $('#main-stats-btn').hide();
      }
    } else {
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
  screenClient.init(agoraAppId, function () {
    console.log("AgoraRTC screenClient initialized");
    joinChannelAsScreenShare(channelName);
    screenShareActive = true;
    // TODO: add logic to swap button
  }, function (err) {
    console.log("[ERROR] : AgoraRTC screenClient init failed", err);
  });  
}

function joinChannelAsScreenShare(channelName) {
  var token = generateToken();
  var userID = null; // set to null to auto generate uid on successfull connection
  screenClient.join(token, channelName, userID, function(uid) { 
    localStreams.screen.id = uid;  // keep track of the uid of the screen stream.
    
    // Create the stream for screen sharing.
    var screenStream = AgoraRTC.createStream({
      streamID: uid,
      audio: false,
      video: false,
      screen: true, // screen stream
      screenAudio: true,
      mediaSource:  'screen', // Firefox: 'screen', 'application', 'window' (select one)
    });
    screenStream.setScreenProfile(screenVideoProfile); // set the profile of the screen
    screenStream.init(function(){
      console.log("getScreen successful");
      localStreams.screen.stream = screenStream; // keep track of the screen stream
      $("#screen-share-btn").prop("disabled",false); // enable button
      screenClient.publish(screenStream, function (err) {
        console.log("[ERROR] : publish screen stream error: " + err);
      });
    }, function (err) {
      console.log("[ERROR] : getScreen failed", err);
      localStreams.screen.id = ""; // reset screen stream id
      localStreams.screen.stream = {}; // reset the screen stream
      screenShareActive = false; // resest screenShare
      toggleScreenShareBtn(); // toggle the button icon back (will appear disabled)
    });
  }, function(err) {
    console.log("[ERROR] : join channel as screen-share failed", err);
  });

  screenClient.on('stream-published', function (evt) {
    console.log("Publish screen stream successfully");
    // localStreams.camera.stream.disableVideo(); // disable the local video stream (will send a mute signal)
    // localStreams.camera.stream.stop(); // stop playing the local stream
    // TODO: add logic to swap main video feed back from container
    if(mainStreamId){
      remoteStreams[mainStreamId].stop(); // stop the main video stream playback
      addRemoteStreamMiniView(remoteStreams[mainStreamId]); // send the main video stream to a container
    }
    mainStreamId = localStreams.screen.id;
    evt.stream.play('full-screen-video');
    // localStreams.screen.stream.play('full-screen-video'); // play the screen share as full-screen-video (vortext effect?)
    $("#video-btn").prop("disabled",true); // disable the video button (as cameara video stream is disabled)
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
                          'id': streamId +'-stats-btn', 
                          'type': 'button', 
                          'class': 'btn btn-lg',
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
    addRemoteStreamMiniView(remoteStreams[mainStreamId]); // send the main video stream to a container
    $(containerId).empty().remove(); // remove the stream's miniView container
    remoteStreams[streamId].stop() // stop the container's video stream playback
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
function enableStats() {
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

  // remote video
  var remoteVideoInterval = setInterval(() => {
    client.getRemoteVideoStats((remoteVideoStatsMap) => {
      for(var uid in remoteVideoStatsMap){
        var remoteVideoStatsBtn;
        if(uid == mainStreamId){
          remoteVideoStatsBtn = $('#main-stats-btn');
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


