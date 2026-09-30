import { useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../cloud/AuthContext';
import { clearPendingAdultInvite, savePendingAdultInvite } from '../cloud/workspaces';
import { createCurrentLegalAcceptance, PRIVACY_URL, TERMS_URL } from '../legal';

type AuthScreenMode = 'signin' | 'signup' | 'adult' | 'child';

export function AuthScreen() {
  const auth = useAuth();
  const [screen, setScreen] = useState<AuthScreenMode>('signin');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [legalAccepted, setLegalAccepted] = useState(false);

  const submit = async () => {
    if (screen === 'child') {
      if (!inviteCode.trim()) return Alert.alert('Enter Your Child Code', 'Ask your parent for the child-generated invite code, then enter it here.');
      setBusy(true);
      try { await auth.createChildAccount(inviteCode); }
      catch (error) { Alert.alert('Could Not Create Child Account', error instanceof Error ? error.message : String(error)); }
      finally { setBusy(false); }
      return;
    }
    if (!email.trim() || password.length < 6 || ((screen === 'signup' || screen === 'adult') && !displayName.trim()) || (screen === 'adult' && !inviteCode.trim())) {
      Alert.alert('Check Your Details', 'Enter a valid email, a password with at least 6 characters, and your name when signing up.');
      return;
    }
    if ((screen === 'signup' || screen === 'adult') && !legalAccepted) {
      Alert.alert('Accept Terms and Privacy Policy', 'Review and accept both documents before creating an adult account.');
      return;
    }
    setBusy(true);
    try {
      if (screen === 'signin') await auth.signIn(email, password);
      else {
        if (screen === 'adult') await savePendingAdultInvite(inviteCode);
        const result = await auth.signUp(email, password, displayName, createCurrentLegalAcceptance(), screen === 'adult' ? inviteCode : undefined);
        if (result.needsEmailConfirmation) Alert.alert('Check Your Email', screen === 'adult' ? 'Confirm your email address, then return to Kudos and sign in. Your family invitation will be accepted automatically.' : 'Confirm your email address, then return to Kudos and sign in.');
      }
    } catch (error) { if (screen === 'adult') await clearPendingAdultInvite(); Alert.alert(screen === 'signin' ? 'Could Not Sign In' : 'Could Not Create Account', error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };

  const requiresLegalAcceptance = screen === 'signup' || screen === 'adult';
  const submitDisabled = busy || (requiresLegalAcceptance && !legalAccepted);
  const creatingAccount = screen !== 'signin';

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.root}>
      <View pointerEvents="none" style={styles.decorations}><Text style={[styles.firework, styles.fireworkLeft]}>✦ ✧ ✦</Text><Text style={[styles.firework, styles.fireworkRight]}>✧ ✦ ✧</Text><Text style={styles.confetti}>◆  ✦  ●   ✧  ◆   ●  ✦     ✧   ◆  ✦</Text></View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.brand}>
          <Image resizeMode="contain" source={require('../../assets/branding/kudos-star-laurel.png')} style={styles.logo} />
          <Image resizeMode="contain" source={require('../../assets/branding/kudos-family-wordmark.png')} style={styles.brandWordmark} />
          <Text style={styles.tagline}>Cloud-synced encouragement across every device</Text>
        </View>
        <View style={styles.card}>
          <View style={styles.tabs}>
            <Pressable onPress={() => setScreen('signin')} style={[styles.tab, screen === 'signin' && styles.tabActive]}><Text style={[styles.tabText, screen === 'signin' && styles.tabTextActive]}>Sign In</Text></Pressable>
            <Pressable onPress={() => setScreen('signup')} style={[styles.tab, creatingAccount && styles.tabActive]}><Text style={[styles.tabText, creatingAccount && styles.tabTextActive]}>Create Account</Text></Pressable>
          </View>
          {creatingAccount ? <><Pressable onPress={() => setScreen('child')} style={[styles.childChoice, screen === 'child' && styles.childChoiceActive]}><Text style={styles.childChoiceText}>Create Child Account</Text><Text style={styles.childChoiceHint}>No email needed</Text></Pressable><Pressable onPress={() => setScreen('adult')} style={[styles.childChoice, screen === 'adult' && styles.childChoiceActive]}><Text style={styles.childChoiceText}>Join existing family as an Adult</Text><Text style={styles.childChoiceHint}>Invitation required</Text></Pressable></> : null}
          {screen === 'child' ? (
            <><Text style={styles.childHelp}>Enter the child-generated code provided by your parent.</Text><TextInput autoCapitalize="characters" autoCorrect={false} maxLength={12} onChangeText={setInviteCode} placeholder="Child code" placeholderTextColor="#9493A5" style={styles.input} value={inviteCode} /></>
          ) : (
            <>{screen === 'signup' || screen === 'adult' ? <TextInput autoCapitalize="words" onChangeText={setDisplayName} placeholder="Your name" placeholderTextColor="#9493A5" style={styles.input} value={displayName} /> : null}<TextInput autoCapitalize="none" autoCorrect={false} keyboardType="email-address" onChangeText={setEmail} placeholder={screen === 'adult' ? 'Invited email address' : 'Email address'} placeholderTextColor="#9493A5" style={styles.input} value={email} /><View style={styles.passwordWrap}><TextInput autoCapitalize="none" autoCorrect={false} onChangeText={setPassword} placeholder="Password" placeholderTextColor="#9493A5" secureTextEntry={!passwordVisible} style={styles.passwordInput} value={password} /><Pressable accessibilityLabel={passwordVisible ? 'Hide password' : 'Show password'} hitSlop={8} onPress={() => setPasswordVisible((value) => !value)} style={styles.passwordToggle}><Text style={styles.passwordToggleText}>{passwordVisible ? 'Hide' : 'Show'}</Text></Pressable></View>{screen === 'adult' ? <><Text style={styles.childHelp}>Use the same email address that received the adult invitation.</Text><TextInput autoCapitalize="characters" autoCorrect={false} maxLength={12} onChangeText={setInviteCode} placeholder="Adult invitation code" placeholderTextColor="#9493A5" style={styles.input} value={inviteCode} /></> : null}</>
          )}
          {requiresLegalAcceptance ? <View style={styles.legalRow}><Pressable accessibilityRole="checkbox" accessibilityState={{ checked: legalAccepted }} hitSlop={7} onPress={() => setLegalAccepted((accepted) => !accepted)} style={[styles.checkbox, legalAccepted && styles.checkboxChecked]}><Text style={styles.checkmark}>{legalAccepted ? '✓' : ''}</Text></Pressable><Text style={styles.legalText}>I accept the <Text onPress={() => void Linking.openURL(TERMS_URL)} style={styles.legalLink}>Terms of Service</Text> and the <Text onPress={() => void Linking.openURL(PRIVACY_URL)} style={styles.legalLink}>Privacy Policy</Text>.</Text></View> : null}
          <Pressable disabled={submitDisabled} onPress={() => void submit()} style={[styles.primary, submitDisabled && styles.disabled]}><Text style={styles.primaryText}>{busy ? 'Connecting…' : screen === 'signin' ? 'Sign in securely' : screen === 'signup' ? 'Create cloud account' : screen === 'adult' ? 'Create account & join family' : 'Create child account'}</Text></Pressable>
          {screen === 'signin' ? <Pressable onPress={() => email.trim() ? void auth.resetPassword(email).then(() => Alert.alert('Email Sent', 'Check your inbox for a password-reset link.')).catch((error) => Alert.alert('Could Not Send Email', error.message)) : Alert.alert('Enter Your Email First')}><Text style={styles.link}>Forgot password?</Text></Pressable> : null}
          {screen === 'adult' ? <Pressable onPress={() => setScreen('signup')}><Text style={styles.link}>Back to regular account creation</Text></Pressable> : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function PasswordRecoveryScreen() {
  const auth = useAuth();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (password.length < 8) return Alert.alert('Password Too Short', 'Use at least 8 characters.');
    if (password !== confirmation) return Alert.alert('Passwords Do Not Match');
    setBusy(true);
    try {
      await auth.updatePassword(password);
      Alert.alert('Password Updated', 'Your new password is ready to use.');
    } catch (error) {
      Alert.alert('Could Not Update Password', error instanceof Error ? error.message : String(error));
    } finally { setBusy(false); }
  };
  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.root}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"><View style={styles.brand}><Image resizeMode="contain" source={require('../../assets/branding/kudos-star-laurel.png')} style={styles.logo}/><Text style={styles.recoveryTitle}>Create a new password</Text><Text style={styles.tagline}>Use at least 8 characters for your parent account.</Text></View><View style={styles.card}><TextInput autoCapitalize="none" onChangeText={setPassword} placeholder="New password" placeholderTextColor="#9493A5" secureTextEntry style={styles.input} value={password}/><TextInput autoCapitalize="none" onChangeText={setConfirmation} placeholder="Confirm new password" placeholderTextColor="#9493A5" secureTextEntry style={styles.input} value={confirmation}/><Pressable disabled={busy} onPress={() => void save()} style={[styles.primary,busy&&styles.disabled]}><Text style={styles.primaryText}>{busy?'Updating…':'Update password'}</Text></Pressable><Pressable disabled={busy} onPress={() => void auth.cancelPasswordRecovery()}><Text style={styles.link}>Cancel and return to sign in</Text></Pressable></View></ScrollView></KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  root:{backgroundColor:'#F4FBF8',flex:1},content:{alignItems:'center',flexGrow:1,justifyContent:'center',padding:22},decorations:{...StyleSheet.absoluteFillObject,overflow:'hidden'},firework:{color:'#D6A727',fontSize:31,opacity:0.13,position:'absolute'},fireworkLeft:{left:18,top:'12%'},fireworkRight:{right:15,top:'29%'},confetti:{bottom:'11%',color:'#C99719',fontSize:21,left:-8,lineHeight:44,opacity:0.12,position:'absolute',right:-8,textAlign:'center'},
  brand:{alignItems:'center',marginBottom:22},logo:{height:82,width:82},brandWordmark:{height:82,marginTop:-2,width:270},tagline:{color:'#5F7475',fontSize:14,marginTop:-5},
  recoveryTitle:{color:'#183437',fontSize:27,fontWeight:'900',marginBottom:10,marginTop:12},
  card:{backgroundColor:'#FFF',borderColor:'#D5E9E4',borderRadius:27,borderWidth:1,gap:10,maxWidth:480,padding:22,width:'100%'},tabs:{backgroundColor:'#EDF7F3',borderRadius:14,flexDirection:'row',marginBottom:4,padding:3},tab:{alignItems:'center',borderRadius:11,flex:1,padding:10},tabActive:{backgroundColor:'#2F9E91'},tabText:{color:'#5F7475',fontSize:13,fontWeight:'900'},tabTextActive:{color:'#FFF'},childChoice:{alignItems:'center',borderColor:'#D5E9E4',borderRadius:13,borderWidth:1,paddingVertical:7,paddingHorizontal:10},childChoiceActive:{backgroundColor:'#E3F8F3',borderColor:'#2F9E91'},childChoiceText:{color:'#2F9E91',fontSize:12,fontWeight:'900'},childChoiceHint:{color:'#5F7475',fontSize:10,marginTop:1},childHelp:{color:'#5F7475',fontSize:13,lineHeight:17,textAlign:'center'},input:{backgroundColor:'#F4FBF8',borderColor:'#D5E9E4',borderRadius:15,borderWidth:1,color:'#183437',fontSize:15,minHeight:52,paddingHorizontal:14},passwordWrap:{alignItems:'center',backgroundColor:'#F4FBF8',borderColor:'#D5E9E4',borderRadius:15,borderWidth:1,flexDirection:'row',minHeight:52},passwordInput:{color:'#183437',flex:1,fontSize:15,minHeight:50,paddingLeft:14,paddingRight:8},passwordToggle:{alignItems:'center',alignSelf:'stretch',justifyContent:'center',paddingHorizontal:14},passwordToggleText:{color:'#0B756F',fontSize:12,fontWeight:'900'},legalRow:{alignItems:'flex-start',flexDirection:'row',gap:9,paddingHorizontal:2,paddingVertical:2},checkbox:{alignItems:'center',borderColor:'#2F9E91',borderRadius:4,borderWidth:2,height:20,justifyContent:'center',marginTop:1,width:20},checkboxChecked:{backgroundColor:'#2F9E91'},checkmark:{color:'#FFF',fontSize:13,fontWeight:'900'},legalText:{color:'#5F7475',flex:1,fontSize:12,lineHeight:18},legalLink:{color:'#0B756F',fontWeight:'900',textDecorationLine:'underline'},primary:{alignItems:'center',backgroundColor:'#2F9E91',borderRadius:16,padding:16},primaryText:{color:'#FFF',fontSize:14,fontWeight:'900'},disabled:{opacity:0.45},link:{color:'#2F9E91',fontSize:13,fontWeight:'800',textAlign:'center'},
});
